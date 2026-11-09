import { esErrorPg, PG_ERRORES, withTransaction, type Queryable } from '../../shared/database/pool';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../shared/events/eventBus';
import { generarToken, hashToken } from '../../shared/security/tokens';
import type { ActualizarEquipoDto, CrearEquipoDto, EquipoDto, InvitacionDto, MiembroDto } from './teams.dto';
import './teams.events';
import { teamsRepository as repo, type InvitacionFila } from './teams.repository';

/** Un enlace de invitación vale 7 días y puede usarlo más de un jugador hasta que el capitán lo revoque. */
export const DIAS_VALIDEZ_ENLACE = 7;

// --- Directorio de usuarios -------------------------------------------------------------------
// teams no conoce la tabla de usuarios: la composición (app.ts) registra cómo consultarla.
export interface UsuarioDirectorio {
  id: number;
  username: string;
  nombre: string;
  fotoUrl: string | null;
}
interface Directorio {
  porUsername: (username: string) => Promise<UsuarioDirectorio | undefined>;
  porIds: (ids: number[]) => Promise<Map<number, UsuarioDirectorio>>;
}
let directorio: Directorio = { porUsername: async () => undefined, porIds: async () => new Map() };
export function registrarDirectorioUsuarios(d: Directorio): void {
  directorio = d;
}

function equipoNoExiste(): AppError {
  return AppError.noEncontrado('EQUIPO_NO_ENCONTRADO', 'El equipo no existe');
}

function asegurarActivo(e: EquipoDto): void {
  if (e.estado !== 'activo') throw AppError.conflicto('EQUIPO_INACTIVO', 'Este equipo está inactivo.');
}

async function equipoDelCapitan(id: number, usuarioId: number, db?: Queryable, bloquear = false): Promise<EquipoDto> {
  const e = await repo.obtener(id, db, bloquear);
  if (!e) throw equipoNoExiste();
  if (e.capitanId !== usuarioId) throw AppError.prohibido('Solo el capitán del equipo puede hacer esto.');
  asegurarActivo(e);
  return e;
}

async function aInvitaciones(filas: InvitacionFila[]): Promise<InvitacionDto[]> {
  const equipos = new Map((await repo.porIds([...new Set(filas.map((f) => f.equipo_id))])).map((e) => [e.id, e]));
  const usuarios = await directorio.porIds(filas.flatMap((f) => (f.usuario_invitado_id ? [f.usuario_invitado_id] : [])));
  return filas.flatMap((f) => {
    const e = equipos.get(f.equipo_id);
    if (!e) return [];
    const u = f.usuario_invitado_id ? usuarios.get(f.usuario_invitado_id) : undefined;
    return [
      {
        id: f.id,
        equipo: { id: e.id, nombre: e.nombre, escudoUrl: e.escudoUrl, nivel: e.nivel, tipoFutbol: e.tipoFutbol },
        usuarioInvitado: f.usuario_invitado_id ? { id: f.usuario_invitado_id, username: u?.username ?? null, nombre: u?.nombre ?? null } : null,
        porEnlace: f.por_enlace,
        estado: f.estado,
        fecha: f.fecha.toISOString(),
      },
    ];
  });
}

export const teamsService = {
  /** HU-19: quien crea el equipo queda como capitán. El nombre es único (sin distinguir mayúsculas). */
  async crear(usuarioId: number, d: CrearEquipoDto): Promise<EquipoDto> {
    try {
      const id = await withTransaction(async (db) => {
        const nuevo = await repo.crear(usuarioId, d, db);
        await repo.agregarMiembro(nuevo, usuarioId, 'capitan', db);
        return nuevo;
      });
      return (await repo.obtener(id))!;
    } catch (err) {
      if (esErrorPg(err, PG_ERRORES.UNIQUE, 'equipo_nombre_uk')) throw AppError.conflicto('NOMBRE_EQUIPO_EN_USO', 'Ya existe un equipo con ese nombre. Elige otro.');
      throw err;
    }
  },

  misEquipos: (usuarioId: number) => repo.deUsuario(usuarioId),

  /** Perfil público del equipo con su plantilla (sin datos de contacto). */
  async detalle(id: number, usuarioId?: number) {
    const equipo = await repo.obtener(id);
    if (!equipo) throw equipoNoExiste();
    const filas = await repo.miembros(id);
    const usuarios = await directorio.porIds(filas.map((m) => m.usuario_id));
    const miembros: MiembroDto[] = filas.filter((m) => usuarios.has(m.usuario_id)).map((m) => {
      const u = usuarios.get(m.usuario_id);
      return { usuarioId: m.usuario_id, username: u?.username ?? null, nombre: u?.nombre ?? null, fotoUrl: u?.fotoUrl ?? null, rolEnEquipo: m.rol_en_equipo, fechaIngreso: m.fecha_ingreso.toISOString() };
    });
    const esMiembro = usuarioId !== undefined && filas.some((m) => m.usuario_id === usuarioId);
    return { equipo: esMiembro ? equipo : { ...equipo, capitanPropuestoId: null }, miembros, esMiembro, esCapitan: esMiembro && usuarioId === equipo.capitanId };
  },

  async actualizar(id: number, usuarioId: number, d: ActualizarEquipoDto): Promise<EquipoDto> {
    await equipoDelCapitan(id, usuarioId);
    await repo.actualizar(id, d.escudoUrl, d.nivel);
    return (await repo.obtener(id))!;
  },

  // --- HU-20 ----------------------------------------------------------------------------------

  /** Invitación por nombre de usuario: el invitado acepta o rechaza. */
  async invitarUsuario(equipoId: number, usuarioId: number, username: string): Promise<InvitacionDto> {
    await equipoDelCapitan(equipoId, usuarioId);
    const invitado = await directorio.porUsername(username);
    if (!invitado) throw AppError.noEncontrado('USUARIO_NO_ENCONTRADO', 'No existe un jugador con ese nombre de usuario');
    if (await repo.esMiembro(equipoId, invitado.id)) throw AppError.conflicto('YA_ES_MIEMBRO', 'Ese jugador ya está en el equipo.');
    if (await repo.hayInvitacionPendiente(equipoId, invitado.id)) throw AppError.conflicto('INVITACION_PENDIENTE', 'Ese jugador ya tiene una invitación pendiente.');
    const id = await repo.crearInvitacion(equipoId, { usuarioId: invitado.id });
    await eventBus.emit('JugadorInvitado', { invitacionId: id, equipoId, usuarioId: invitado.id });
    return (await aInvitaciones([(await repo.obtenerInvitacion(id))!]))[0]!;
  },

  /** Enlace de invitación: el token solo se muestra al crearlo; en la BD queda su hash. */
  async crearEnlace(equipoId: number, usuarioId: number): Promise<{ token: string; validoPorDias: number }> {
    await equipoDelCapitan(equipoId, usuarioId);
    const token = generarToken();
    await repo.crearInvitacion(equipoId, { tokenHash: hashToken(token) });
    return { token, validoPorDias: DIAS_VALIDEZ_ENLACE };
  },

  async invitacionesDeEquipo(equipoId: number, usuarioId: number) {
    await equipoDelCapitan(equipoId, usuarioId);
    return aInvitaciones(await repo.invitacionesDeEquipo(equipoId));
  },

  async misInvitaciones(usuarioId: number) {
    return aInvitaciones(await repo.invitacionesDeUsuario(usuarioId));
  },

  async revocarInvitacion(equipoId: number, usuarioId: number, invitacionId: number): Promise<void> {
    await equipoDelCapitan(equipoId, usuarioId);
    const inv = await repo.obtenerInvitacion(invitacionId);
    if (!inv || inv.equipo_id !== equipoId || inv.estado !== 'pendiente') throw AppError.noEncontrado('INVITACION_NO_ENCONTRADA', 'La invitación no existe');
    await repo.cambiarEstadoInvitacion(invitacionId, 'rechazada');
  },

  /** HU-20.2: si acepta aparece en la plantilla (HU-20.3: conserva sus otros equipos); si rechaza, se avisa al capitán. */
  async responderInvitacion(invitacionId: number, usuarioId: number, aceptar: boolean): Promise<void> {
    const res = await withTransaction(async (db) => {
      const inv = await repo.obtenerInvitacion(invitacionId, db, true);
      if (!inv || inv.usuario_invitado_id !== usuarioId) throw AppError.noEncontrado('INVITACION_NO_ENCONTRADA', 'La invitación no existe');
      if (inv.estado !== 'pendiente') throw AppError.conflicto('INVITACION_RESUELTA', 'Esta invitación ya fue respondida.');
      const equipo = await repo.obtener(inv.equipo_id, db);
      if (aceptar) {
        asegurarActivo(equipo!);
        await repo.agregarMiembro(inv.equipo_id, usuarioId, 'miembro', db);
      }
      await repo.cambiarEstadoInvitacion(invitacionId, aceptar ? 'aceptada' : 'rechazada', db);
      return equipo!;
    });
    if (!aceptar) await eventBus.emit('InvitacionRechazada', { invitacionId, equipoId: res.id, capitanId: res.capitanId, usuarioId });
  },

  /** Datos del equipo para la página "unirme" (no consume el enlace). */
  async vistaEnlace(token: string, ahora = new Date()) {
    const e = await equipoDeEnlace(token, ahora);
    return { equipo: { id: e.id, nombre: e.nombre, escudoUrl: e.escudoUrl, nivel: e.nivel, tipoFutbol: e.tipoFutbol, totalMiembros: e.totalMiembros } };
  },

  /** HU-20.1: un jugador registrado abre el enlace y acepta. */
  async unirsePorEnlace(token: string, usuarioId: number, ahora = new Date()): Promise<EquipoDto> {
    const e = await equipoDeEnlace(token, ahora);
    const agregado = await withTransaction(async (db) => {
      asegurarActivo((await repo.obtener(e.id, db, true))!);
      return repo.agregarMiembro(e.id, usuarioId, 'miembro', db);
    });
    if (!agregado) throw AppError.conflicto('YA_ES_MIEMBRO', 'Ya eres miembro de este equipo.');
    return (await repo.obtener(e.id))!;
  },

  // --- HU-21 ----------------------------------------------------------------------------------

  /** HU-21.1: el miembro expulsado deja de ver lo privado del equipo. El capitán no se expulsa a sí mismo. */
  async expulsar(equipoId: number, capitanId: number, usuarioId: number): Promise<void> {
    await withTransaction(async (db) => {
      const e = await equipoDelCapitan(equipoId, capitanId, db, true);
      if (usuarioId === e.capitanId) throw AppError.conflicto('CAPITAN_NO_EXPULSABLE', 'El capitán no puede expulsarse. Cede la capitanía o sal del equipo.');
      if (!(await repo.quitarMiembro(equipoId, usuarioId, db))) throw AppError.noEncontrado('MIEMBRO_NO_ENCONTRADO', 'Ese jugador no está en el equipo');
      if (e.capitanPropuestoId === usuarioId) await repo.proponerCapitan(equipoId, null, db);
      // Sin esto, el expulsado volvería a entrar con un enlace que ya conocía (HU-21.1).
      await repo.revocarAccesosTrasExpulsion(equipoId, usuarioId, db);
    });
  },

  /** HU-21.3: si el único miembro sale, el equipo queda inactivo. Un capitán con plantilla debe ceder antes. */
  async salir(equipoId: number, usuarioId: number): Promise<{ equipoInactivo: boolean }> {
    const r = await withTransaction(async (db) => {
      const e = await repo.obtener(equipoId, db, true);
      if (!e) throw equipoNoExiste();
      if (!(await repo.esMiembro(equipoId, usuarioId, db))) throw AppError.noEncontrado('MIEMBRO_NO_ENCONTRADO', 'No eres miembro de este equipo');
      if (e.capitanId === usuarioId && e.totalMiembros > 1) {
        throw AppError.conflicto('CAPITAN_DEBE_CEDER', 'Cede la capitanía a otro miembro antes de salir del equipo.');
      }
      if (e.capitanId === usuarioId) {
        // capitan_id se conserva como referencia histórica; ya no es miembro de un equipo inactivo.
        await repo.quitarMiembro(equipoId, usuarioId, db);
        await repo.inactivar(equipoId, db);
        return { equipoInactivo: true };
      }
      await repo.quitarMiembro(equipoId, usuarioId, db);
      if (e.capitanPropuestoId === usuarioId) await repo.proponerCapitan(equipoId, null, db);
      return { equipoInactivo: false };
    });
    if (r.equipoInactivo) await eventBus.emit('EquipoInactivado', { equipoId });
    return r;
  },

  /** HU-21.2: el capitán propone; el cambio ocurre cuando el otro acepta. */
  async proponerCapitania(equipoId: number, capitanId: number, usuarioId: number): Promise<EquipoDto> {
    await withTransaction(async (db) => {
      const e = await equipoDelCapitan(equipoId, capitanId, db, true);
      if (usuarioId === e.capitanId) throw AppError.validacion([{ campo: 'usuarioId', mensaje: 'Ya eres el capitán' }]);
      if (!(await repo.esMiembro(equipoId, usuarioId, db))) throw AppError.noEncontrado('MIEMBRO_NO_ENCONTRADO', 'Ese jugador no está en el equipo');
      await repo.proponerCapitan(equipoId, usuarioId, db);
    });
    await eventBus.emit('CapitaniaPropuesta', { equipoId, usuarioId });
    return (await repo.obtener(equipoId))!;
  },

  async responderCapitania(equipoId: number, usuarioId: number, aceptar: boolean): Promise<EquipoDto> {
    await withTransaction(async (db) => {
      const e = await repo.obtener(equipoId, db, true);
      if (!e) throw equipoNoExiste();
      if (e.capitanPropuestoId !== usuarioId) throw AppError.conflicto('SIN_PROPUESTA', 'No tienes una propuesta de capitanía en este equipo.');
      if (aceptar) await repo.cambiarCapitan(equipoId, usuarioId, db);
      else await repo.proponerCapitan(equipoId, null, db);
    });
    return (await repo.obtener(equipoId))!;
  },
};

async function equipoDeEnlace(token: string, ahora: Date): Promise<EquipoDto> {
  const inv = await repo.invitacionPorToken(hashToken(token));
  if (!inv || inv.estado !== 'pendiente') throw new AppError(400, 'TOKEN_INVALIDO', 'El enlace de invitación no es válido o fue revocado.');
  if (ahora.getTime() - inv.fecha.getTime() > DIAS_VALIDEZ_ENLACE * 86_400_000) {
    throw new AppError(400, 'TOKEN_EXPIRADO', 'El enlace de invitación expiró. Pide uno nuevo al capitán.');
  }
  const e = (await repo.obtener(inv.equipo_id))!;
  asegurarActivo(e);
  return e;
}
