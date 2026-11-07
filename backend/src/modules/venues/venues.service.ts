import { esErrorPg, PG_ERRORES, withTransaction, type Queryable } from '../../shared/database/pool';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../shared/events/eventBus';
import { auditar } from '../../shared/logger/audit';
import type { UsuarioSesion } from '../../shared/middleware/authenticate';
import { hoyBogota, partesBogota, sumarDias } from '../../shared/utils/time';
import { precioDeFranja } from './domain/rates';
import { franjasDelDia, quedaFueraDeHorario, validarHorario } from './domain/schedule';
import { franjaSeCruzaConRango, marcarFranjas } from './domain/slots';
import type {
  BloqueoDto,
  BloqueoInput,
  CanchaDto,
  CanchaInput,
  ComplejoDto,
  ComplejoInput,
  ComplejoResumenDto,
  FiltrosComplejos,
  FotoDto,
  FranjaDto,
  HorarioDto,
  HorarioEspecialInput,
  ReservaActivaDto,
  TarifaDto,
  TarifaInput,
} from './venues.dto';
import './venues.events';
import { venuesRepository as repo } from './venues.repository';

const MAX_FOTOS = 10;

// --- Puerto hacia reservas ---------------------------------------------------------------------
// venues no puede importar bookings (bookings depende de venues). bookings registra aquí cómo
// consultar sus reservas activas para las advertencias de HU-07 y HU-09.
export type ConsultaReservas = (
  filtro: { complejoId?: number; canchaId?: number; desdeFecha: string; hastaFecha?: string },
  db?: Queryable,
) => Promise<ReservaActivaDto[]>;

let consultaReservas: ConsultaReservas = async () => [];

export function registrarConsultaReservas(fn: ConsultaReservas): void {
  consultaReservas = fn;
}

// --- Permisos (RNF-02) -------------------------------------------------------------------------

async function asegurarPropietario(complejoId: number, usuario: UsuarioSesion, db?: Queryable) {
  const c = await repo.propietarioComplejo(complejoId, db);
  if (!c) throw AppError.noEncontrado('COMPLEJO_NO_ENCONTRADO', 'El complejo no existe');
  if (usuario.rol !== 'Superadmin' && c.admin_id !== usuario.id) {
    throw AppError.prohibido('Solo el administrador del complejo puede hacer esto.');
  }
  return c;
}

const puedeVerNoActivo = (usuario: UsuarioSesion | undefined, adminId: number) =>
  !!usuario && (usuario.rol === 'Superadmin' || usuario.id === adminId);

async function canchaDelPropietario(canchaId: number, usuario: UsuarioSesion, db?: Queryable) {
  const cancha = await repo.obtenerCancha(canchaId, db);
  if (!cancha) throw AppError.noEncontrado('CANCHA_NO_ENCONTRADA', 'La cancha no existe');
  if (usuario.rol !== 'Superadmin' && cancha.adminId !== usuario.id) {
    throw AppError.prohibido('Solo el administrador del complejo puede hacer esto.');
  }
  return cancha;
}

async function validarServicios(ids: number[]) {
  if (!(await repo.serviciosExisten(ids))) {
    throw AppError.validacion([{ campo: 'servicioIds', mensaje: 'Algún servicio no existe' }]);
  }
}

function errorNombreCancha(err: unknown): never {
  if (esErrorPg(err, PG_ERRORES.UNIQUE, 'cancha_nombre_uk')) {
    throw AppError.conflicto('CANCHA_DUPLICADA', 'Ya existe una cancha con ese nombre en este complejo');
  }
  throw err;
}

function errorTarifa(err: unknown): never {
  if (esErrorPg(err, PG_ERRORES.EXCLUSION, 'tarifa_sin_cruces')) {
    throw AppError.conflicto('TARIFA_CRUZADA', 'La tarifa se cruza con otra tarifa activa del mismo tipo de día');
  }
  throw err;
}

/** Reservas activas desde hoy que quedarían fuera del horario del complejo (HU-07 criterio 3). */
async function reservasFueraDeHorario(complejoId: number, db: Queryable): Promise<ReservaActivaDto[]> {
  const [horarios, reservas] = await Promise.all([
    repo.listarHorarios(complejoId, db),
    consultaReservas({ complejoId, desdeFecha: hoyBogota() }, db),
  ]);
  return reservas.filter((r) => quedaFueraDeHorario(r, horarios));
}

export const venuesService = {
  listarServicios: () => repo.listarServicios(),

  // --- Complejos (HU-05) ----------------------------------------------------------------------

  /** HU-05 criterio 1: el complejo queda "pendiente" de aprobación. */
  async crearComplejo(usuario: UsuarioSesion, d: ComplejoInput): Promise<ComplejoDto> {
    if (!usuario.correoVerificado) {
      throw new AppError(403, 'CORREO_NO_VERIFICADO', 'Confirma tu correo antes de registrar un complejo.');
    }
    await validarServicios(d.servicioIds);
    const id = await withTransaction(async (db) => {
      const nuevo = await repo.crearComplejo(usuario.id, d, db);
      await repo.reemplazarServicios(nuevo, d.servicioIds, db);
      return nuevo;
    });
    auditar('complejo.creado', { usuarioId: usuario.id, entidad: 'complejo', entidadId: id });
    await eventBus.emit('ComplejoRegistrado', { complejoId: id, adminId: usuario.id });
    return (await repo.obtenerComplejo(id))!;
  },

  async actualizarComplejo(id: number, usuario: UsuarioSesion, d: ComplejoInput): Promise<ComplejoDto> {
    const actual = await asegurarPropietario(id, usuario);
    await validarServicios(d.servicioIds);
    await withTransaction(async (db) => {
      await repo.actualizarComplejo(id, d, db);
      await repo.reemplazarServicios(id, d.servicioIds, db);
    });
    // Un complejo rechazado que se corrige vuelve a revisión.
    if (actual.estado === 'rechazado') await repo.cambiarEstadoComplejo(id, 'pendiente', null);
    return (await repo.obtenerComplejo(id))!;
  },

  /** HU-05 criterio 2: solo los complejos activos aparecen en las búsquedas. */
  async buscarComplejos(f: FiltrosComplejos): Promise<{ complejos: ComplejoResumenDto[]; total: number; pagina: number; tamano: number }> {
    const r = await repo.listarComplejos({ ...f, estado: 'activo' });
    return { ...r, pagina: f.pagina, tamano: f.tamano };
  },

  async misComplejos(usuario: UsuarioSesion): Promise<ComplejoResumenDto[]> {
    return (await repo.listarComplejos({ adminId: usuario.id, tamano: 500 })).complejos;
  },

  /** HU-33: el superadministrador decide con el detalle completo (teléfono, descripción, fotos). */
  async complejosPendientes(): Promise<ComplejoDto[]> {
    const { complejos } = await repo.listarComplejos({ estado: 'pendiente', tamano: 500 });
    const detalles = await Promise.all(complejos.map((c) => repo.obtenerComplejo(c.id)));
    return detalles
      .filter((d): d is ComplejoDto => d !== undefined)
      .sort((a, b) => a.fechaCreacion.localeCompare(b.fechaCreacion));
  },

  /** Detalle con canchas, horarios y servicios. Un complejo no activo solo lo ve su dueño o el superadmin. */
  async detalleComplejo(id: number, usuario?: UsuarioSesion) {
    const complejo = await repo.obtenerComplejo(id);
    if (!complejo) throw AppError.noEncontrado('COMPLEJO_NO_ENCONTRADO', 'El complejo no existe');
    const esGestor = puedeVerNoActivo(usuario, complejo.adminId);
    if (complejo.estado !== 'activo' && !esGestor) throw AppError.noEncontrado('COMPLEJO_NO_ENCONTRADO', 'El complejo no existe');
    const [canchas, horarios] = await Promise.all([repo.listarCanchas(id, !esGestor), repo.listarHorarios(id)]);
    const hoy = hoyBogota();
    return {
      complejo,
      canchas,
      // Al público solo le interesan las fechas especiales que vienen.
      horarios: esGestor ? horarios : horarios.filter((h) => h.fechaEspecial === null || h.fechaEspecial >= hoy),
      esGestor,
    };
  },

  /** HU-33 criterio 1 (y HU-05 criterio 2): aprobar o rechazar con motivo. */
  async resolverAprobacion(id: number, usuario: UsuarioSesion, aprobar: boolean, motivo: string | null | undefined): Promise<ComplejoDto> {
    const complejo = await repo.obtenerComplejo(id);
    if (!complejo) throw AppError.noEncontrado('COMPLEJO_NO_ENCONTRADO', 'El complejo no existe');
    const yaResuelto = () => AppError.conflicto('COMPLEJO_YA_RESUELTO', 'El complejo ya fue aprobado o rechazado');
    if (complejo.estado !== 'pendiente') throw yaResuelto();
    if (!(await repo.resolverPendiente(id, aprobar ? 'activo' : 'rechazado', aprobar ? null : motivo!))) throw yaResuelto();
    if (aprobar) {
      auditar('complejo.aprobado', { usuarioId: usuario.id, entidad: 'complejo', entidadId: id });
      await eventBus.emit('ComplejoAprobado', { complejoId: id, adminId: complejo.adminId, nombre: complejo.nombre });
    } else {
      auditar('complejo.rechazado', { usuarioId: usuario.id, entidad: 'complejo', entidadId: id, motivo });
      await eventBus.emit('ComplejoRechazado', { complejoId: id, adminId: complejo.adminId, nombre: complejo.nombre, motivo: motivo! });
    }
    return (await repo.obtenerComplejo(id))!;
  },

  async reemplazarServicios(id: number, usuario: UsuarioSesion, servicioIds: number[]): Promise<ComplejoDto> {
    await asegurarPropietario(id, usuario);
    await validarServicios(servicioIds);
    await withTransaction((db) => repo.reemplazarServicios(id, servicioIds, db));
    return (await repo.obtenerComplejo(id))!;
  },

  async agregarFoto(id: number, usuario: UsuarioSesion, url: string): Promise<FotoDto> {
    await asegurarPropietario(id, usuario);
    return withTransaction(async (db) => {
      await repo.bloquearComplejo(id, db);
      if ((await repo.contarFotos(id, db)) >= MAX_FOTOS) {
        throw AppError.conflicto('MAXIMO_FOTOS', `Un complejo puede tener máximo ${MAX_FOTOS} fotos`);
      }
      return repo.agregarFoto(id, url, db);
    });
  },

  async eliminarFoto(id: number, usuario: UsuarioSesion, fotoId: number): Promise<void> {
    await asegurarPropietario(id, usuario);
    if (!(await repo.eliminarFoto(id, fotoId))) throw AppError.noEncontrado('FOTO_NO_ENCONTRADA', 'La foto no existe');
  },

  // --- Canchas (HU-06) ------------------------------------------------------------------------

  async crearCancha(complejoId: number, usuario: UsuarioSesion, d: CanchaInput): Promise<CanchaDto> {
    await asegurarPropietario(complejoId, usuario);
    try {
      return await repo.crearCancha(complejoId, { ...d, capacidadJugadores: d.capacidadJugadores ?? d.tipoFutbol * 2 });
    } catch (err) {
      errorNombreCancha(err);
    }
  },

  /** HU-06 criterio 3: desactivar conserva el historial (nunca se borra una cancha). */
  async actualizarCancha(canchaId: number, usuario: UsuarioSesion, d: CanchaInput): Promise<CanchaDto> {
    await canchaDelPropietario(canchaId, usuario);
    try {
      return await repo.actualizarCancha(canchaId, { ...d, capacidadJugadores: d.capacidadJugadores ?? d.tipoFutbol * 2 });
    } catch (err) {
      errorNombreCancha(err);
    }
  },

  async obtenerCanchaPublica(canchaId: number, usuario?: UsuarioSesion) {
    const cancha = await repo.obtenerCancha(canchaId);
    const visible = cancha && ((cancha.estado === 'activa' && cancha.estadoComplejo === 'activo') || puedeVerNoActivo(usuario, cancha.adminId));
    if (!cancha || !visible) throw AppError.noEncontrado('CANCHA_NO_ENCONTRADA', 'La cancha no existe');
    return cancha;
  },

  // --- Horarios (HU-07) -----------------------------------------------------------------------

  async listarHorarios(complejoId: number, usuario: UsuarioSesion): Promise<HorarioDto[]> {
    await asegurarPropietario(complejoId, usuario);
    return repo.listarHorarios(complejoId);
  },

  /**
   * HU-07 criterio 1 y 3: reemplaza el horario habitual. Si quedan reservas fuera del nuevo horario se
   * avisa en `advertencias` y no se eliminan.
   */
  async guardarHorarioHabitual(
    complejoId: number,
    usuario: UsuarioSesion,
    dias: { diaSemana: number; horaApertura: string; horaCierre: string; duracionTurnoMin: number }[],
  ) {
    validarHorarios(dias.map((d) => ({ ...d, campo: `dias.${d.diaSemana}` })));
    await asegurarPropietario(complejoId, usuario);
    return withTransaction(async (db) => {
      await repo.reemplazarHorarioHabitual(complejoId, dias, db);
      return {
        horarios: await repo.listarHorarios(complejoId, db),
        advertencias: { reservasFueraDeHorario: await reservasFueraDeHorario(complejoId, db) },
      };
    });
  },

  /** HU-07 criterio 2: la fecha especial reemplaza al horario habitual solo ese día. */
  async guardarHorarioEspecial(complejoId: number, usuario: UsuarioSesion, d: HorarioEspecialInput) {
    if (!d.cerrado) validarHorarios([{ ...d, campo: 'horaCierre' }]);
    if (d.fecha < hoyBogota()) throw AppError.validacion([{ campo: 'fecha', mensaje: 'La fecha no puede estar en el pasado' }]);
    await asegurarPropietario(complejoId, usuario);
    return withTransaction(async (db) => {
      await repo.guardarHorarioEspecial(complejoId, d, db);
      return {
        horarios: await repo.listarHorarios(complejoId, db),
        advertencias: { reservasFueraDeHorario: await reservasFueraDeHorario(complejoId, db) },
      };
    });
  },

  async eliminarHorarioEspecial(complejoId: number, usuario: UsuarioSesion, fecha: string): Promise<void> {
    await asegurarPropietario(complejoId, usuario);
    if (!(await repo.eliminarHorarioEspecial(complejoId, fecha))) {
      throw AppError.noEncontrado('HORARIO_NO_ENCONTRADO', 'No hay un horario especial en esa fecha');
    }
  },

  // --- Tarifas (HU-08) ------------------------------------------------------------------------

  async listarTarifas(canchaId: number, usuario?: UsuarioSesion): Promise<TarifaDto[]> {
    await this.obtenerCanchaPublica(canchaId, usuario);
    return repo.listarTarifas(canchaId);
  },

  async crearTarifa(canchaId: number, usuario: UsuarioSesion, d: TarifaInput): Promise<TarifaDto> {
    validarRangoTarifa(d);
    await canchaDelPropietario(canchaId, usuario);
    try {
      return await repo.crearTarifa(canchaId, d);
    } catch (err) {
      errorTarifa(err);
    }
  },

  /**
   * HU-08 criterio 3 / RN-04: cambiar una tarifa crea una nueva y desactiva la anterior; las reservas ya
   * hechas guardaron su propio precio y no cambian.
   */
  async actualizarTarifa(tarifaId: number, usuario: UsuarioSesion, d: TarifaInput): Promise<TarifaDto> {
    validarRangoTarifa(d);
    const actual = await repo.obtenerTarifa(tarifaId);
    if (!actual || !actual.activa) throw AppError.noEncontrado('TARIFA_NO_ENCONTRADA', 'La tarifa no existe');
    await canchaDelPropietario(actual.canchaId, usuario);
    try {
      return await withTransaction(async (db) => {
        await repo.desactivarTarifa(tarifaId, db);
        return repo.crearTarifa(actual.canchaId, d, db);
      });
    } catch (err) {
      errorTarifa(err);
    }
  },

  async eliminarTarifa(tarifaId: number, usuario: UsuarioSesion): Promise<void> {
    const actual = await repo.obtenerTarifa(tarifaId);
    if (!actual || !actual.activa) throw AppError.noEncontrado('TARIFA_NO_ENCONTRADA', 'La tarifa no existe');
    await canchaDelPropietario(actual.canchaId, usuario);
    await repo.desactivarTarifa(tarifaId);
  },

  // --- Bloqueos (HU-09) -----------------------------------------------------------------------

  async listarBloqueos(canchaId: number, usuario: UsuarioSesion, desde?: string, hasta?: string): Promise<BloqueoDto[]> {
    await canchaDelPropietario(canchaId, usuario);
    const inicio = desde ?? hoyBogota();
    const fin = hasta ?? sumarDias(inicio, 366);
    return repo.listarBloqueos(canchaId, `${inicio} 00:00`, `${sumarDias(fin, 1)} 00:00`);
  },

  /** HU-09 criterio 2: si hay reservas activas en el rango, se advierte y no se bloquea. */
  async crearBloqueo(canchaId: number, usuario: UsuarioSesion, d: BloqueoInput, ahora = new Date()): Promise<BloqueoDto> {
    const inicio = `${d.fechaInicio.fecha}T${d.fechaInicio.hora}`;
    const fin = `${d.fechaFin.fecha}T${d.fechaFin.hora}`;
    if (fin <= inicio) throw AppError.validacion([{ campo: 'fechaFin', mensaje: 'El fin debe ser posterior al inicio' }]);
    const a = partesBogota(ahora);
    if (fin <= `${a.fecha}T${a.hora}`) throw AppError.validacion([{ campo: 'fechaFin', mensaje: 'El bloqueo no puede terminar en el pasado' }]);
    await canchaDelPropietario(canchaId, usuario);

    const bloqueo = await withTransaction(async (db) => {
      // Serializa con las reservas de la misma cancha (HT-05).
      await repo.bloquearCancha(canchaId, db);
      const reservas = await consultaReservas(
        { canchaId, desdeFecha: d.fechaInicio.fecha, hastaFecha: d.fechaFin.fecha },
        db,
      );
      const rango = { fechaInicio: inicio, fechaFin: fin };
      const enConflicto = reservas.filter((r) => franjaSeCruzaConRango(r.fecha, r, rango));
      if (enConflicto.length) {
        throw AppError.conflicto(
          'BLOQUEO_CON_RESERVAS',
          'Hay reservas en ese rango. Reprográmalas o cancélalas antes de bloquear.',
          { reservas: enConflicto },
        );
      }
      return repo.crearBloqueo(canchaId, usuario.id, d.fechaInicio, d.fechaFin, d.motivo, db);
    });
    return bloqueo;
  },

  async eliminarBloqueo(bloqueoId: number, usuario: UsuarioSesion): Promise<void> {
    const b = await repo.obtenerBloqueo(bloqueoId);
    if (!b) throw AppError.noEncontrado('BLOQUEO_NO_ENCONTRADO', 'El bloqueo no existe');
    await canchaDelPropietario(b.canchaId, usuario);
    await repo.eliminarBloqueo(bloqueoId);
  },

  // --- Franjas (HU-07 a HU-09; bookings agrega reservas en HU-10) -----------------------------

  async franjasDeCancha(canchaId: number, fecha: string, usuario?: UsuarioSesion, ahora = new Date()): Promise<{ cancha: CanchaDto; franjas: FranjaDto[] }> {
    const cancha = await this.obtenerCanchaPublica(canchaId, usuario);
    const [horarios, tarifas, bloqueos] = await Promise.all([
      repo.listarHorarios(cancha.complejoId),
      repo.listarTarifas(canchaId),
      repo.listarBloqueos(canchaId, `${fecha} 00:00`, `${sumarDias(fecha, 1)} 00:00`),
    ]);
    const a = partesBogota(ahora);
    const franjas = marcarFranjas(
      fecha,
      franjasDelDia(fecha, horarios),
      (f) => precioDeFranja(fecha, f.horaInicio, tarifas)?.precio ?? null,
      bloqueos,
      `${a.fecha}T${a.hora}`,
    );
    const { estadoComplejo: _e, adminId: _a, ...publica } = cancha;
    return { cancha: publica, franjas };
  },
};

function validarHorarios(horarios: { horaApertura: string; horaCierre: string; duracionTurnoMin: number; campo: string }[]): void {
  const errores = horarios
    .map((h) => ({ campo: h.campo, mensaje: validarHorario(h) }))
    .filter((e): e is { campo: string; mensaje: string } => e.mensaje !== null);
  if (errores.length) throw AppError.validacion(errores);
}

function validarRangoTarifa(d: TarifaInput): void {
  if (d.horaFin <= d.horaInicio) {
    throw AppError.validacion([{ campo: 'horaFin', mensaje: 'La hora final debe ser posterior a la inicial' }]);
  }
}
