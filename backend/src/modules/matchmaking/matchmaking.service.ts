import { obtenerParametros } from '../../shared/config/parametros';
import { esErrorPg, PG_ERRORES, withTransaction, type Queryable } from '../../shared/database/pool';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../shared/events/eventBus';
import type { UsuarioSesion } from '../../shared/middleware/authenticate';
import { horaAMinutos, instanteBogota } from '../../shared/utils/time';
import { bookingsApi, estaActiva, type ReservaInterna } from '../bookings';
import { dividirValor } from '../payments';
import { teamsApi, type EquipoDto, type UsuarioDirectorio } from '../teams';
import { cuposValidos, maximoDeCupos, reservaDentroDeLoPedido, trasAceptarJugador, validarPublicacion } from './domain/publication-rules';
import { hayConflictoDeHorario, type Horario } from './domain/schedule-conflict';
import { estaSuspendido } from './domain/suspension';
import type { EquipoResumenDto, FiltrosPartidos, InscripcionDto, PartidoDto, PostulacionDto, PublicarDto } from './matchmaking.dto';
import './matchmaking.events';
import { matchmakingRepository as repo, type PartidoFila } from './matchmaking.repository';

// --- Puertos ------------------------------------------------------------------------------------
// ratings depende de matchmaking: registra aquí la reputación (HU-22.2). La composición registra los jugadores.
type ReputacionEquipos = (ids: number[]) => Promise<Map<number, number>>;
let reputacion: ReputacionEquipos = async () => new Map();
export function registrarReputacionEquipos(fn: ReputacionEquipos): void {
  reputacion = fn;
}
type DirectorioJugadores = (ids: number[]) => Promise<Map<number, UsuarioDirectorio>>;
let jugadores: DirectorioJugadores = async () => new Map();
export function registrarDirectorioJugadores(fn: DirectorioJugadores): void {
  jugadores = fn;
}

const MENSAJES_PUBLICACION = {
  RESERVA_NO_CONFIRMADA: 'Solo puedes publicar una reserva confirmada.',
  ANTICIPACION_INSUFICIENTE: 'Solo puedes publicar con al menos {h} horas de anticipación al partido.',
};

const noExiste = () => AppError.noEncontrado('PARTIDO_NO_ENCONTRADO', 'El partido no existe');

/** Dentro de una transacción siempre se pasa `db` (no pedir otra conexión al pool); `bloquear` serializa RN-11. */
async function equipoCapitaneado(equipoId: number, usuario: UsuarioSesion, db?: Queryable, bloquear = false): Promise<EquipoDto> {
  const e = bloquear && db ? await teamsApi.bloquear(equipoId, db) : await teamsApi.obtener(equipoId, db);
  if (!e) throw AppError.noEncontrado('EQUIPO_NO_ENCONTRADO', 'El equipo no existe');
  if (e.capitanId !== usuario.id) throw AppError.prohibido('Solo el capitán del equipo puede hacer esto.');
  if (e.estado !== 'activo') throw AppError.conflicto('EQUIPO_INACTIVO', 'Este equipo está inactivo.');
  return e;
}

function asegurarNoSuspendido(e: EquipoDto, ahora: Date): void {
  // RN-08
  if (estaSuspendido(e.suspendidoHasta, ahora)) {
    throw new AppError(403, 'EQUIPO_SUSPENDIDO', 'Tu equipo está suspendido de Busca Partido por inasistencias.', undefined, { suspendidoHasta: e.suspendidoHasta });
  }
}

/** El otro equipo del partido también debe poder jugar: activo y sin suspensión (RN-08). */
function asegurarContraparte(e: EquipoDto | undefined, ahora: Date): void {
  if (!e || e.estado !== 'activo' || estaSuspendido(e.suspendidoHasta, ahora)) {
    throw AppError.conflicto('EQUIPO_NO_DISPONIBLE', 'El otro equipo de este partido ya no está disponible.');
  }
}

/** RN-11: el equipo no puede estar en dos partidos que se crucen. Se llama con el equipo bloqueado. */
async function asegurarSinCruce(equipoId: number, horario: Horario, excluirPartidoId: number | null, db: Queryable): Promise<void> {
  const ids = await repo.reservasActivasDeEquipo(equipoId, excluirPartidoId, db);
  const reservas = (await bookingsApi.porIds(ids, db)).filter((r) => estaActiva(r.estado));
  if (hayConflictoDeHorario(horario, reservas)) {
    throw AppError.conflicto('CRUCE_DE_HORARIO', 'El equipo ya tiene un partido que se cruza con ese horario.');
  }
}

async function validarReservaPublicable(r: ReservaInterna, ahora: Date, db: Queryable): Promise<void> {
  const { horasMinPublicacion } = await obtenerParametros(db);
  const motivo = validarPublicacion({ estadoReserva: r.estado, fecha: r.fecha, horaInicio: r.horaInicio, horasMinimas: horasMinPublicacion, ahora });
  if (motivo) throw AppError.conflicto(motivo, MENSAJES_PUBLICACION[motivo].replace('{h}', String(horasMinPublicacion)));
}

const empezo = (r: { fecha: string; horaInicio: string }, ahora: Date) => instanteBogota(r.fecha, r.horaInicio) <= ahora;

/** Partido abierto aún vigente: sigue buscando y su reserva está activa y no ha empezado. */
async function asegurarAbierto(p: PartidoFila, ahora: Date, db: Queryable): Promise<ReservaInterna | undefined> {
  if (p.estado !== 'buscando') throw AppError.conflicto('PARTIDO_CERRADO', 'Este partido ya no está disponible.');
  if (p.reserva_id === null) return undefined;
  const r = await bookingsApi.obtener(p.reserva_id, db);
  if (!r || !estaActiva(r.estado) || empezo(r, ahora)) throw AppError.conflicto('PARTIDO_CERRADO', 'Este partido ya no está disponible.');
  return r;
}

async function aDtos(filas: PartidoFila[]): Promise<PartidoDto[]> {
  const reservaIds = filas.flatMap((p) => (p.reserva_id ? [p.reserva_id] : []));
  const equipoIds = [...new Set(filas.flatMap((p) => (p.equipo_rival_id ? [p.equipo_publicador_id, p.equipo_rival_id] : [p.equipo_publicador_id])))];
  const [reservas, equipos, fairPlay] = await Promise.all([bookingsApi.porIds(reservaIds), teamsApi.porIds(equipoIds), reputacion(equipoIds)]);
  const porReserva = new Map(reservas.map((r) => [r.id, r]));
  const porEquipo = new Map(equipos.map((e) => [e.id, e]));
  const resumen = (id: number): EquipoResumenDto => {
    const e = porEquipo.get(id)!;
    return { id: e.id, nombre: e.nombre, escudoUrl: e.escudoUrl, nivel: e.nivel, tipoFutbol: e.tipoFutbol, fairPlay: fairPlay.get(id) ?? null };
  };
  return filas.map((p) => {
    const r = p.reserva_id ? porReserva.get(p.reserva_id) : undefined;
    return {
      id: p.id,
      modalidad: p.modalidad,
      estado: p.estado,
      nivelBuscado: p.nivel_buscado,
      descripcion: p.descripcion,
      aceptacionAutomatica: p.aceptacion_automatica,
      porcentajePagoRival: p.porcentaje_pago_rival,
      cuposDisponibles: p.cupos_disponibles,
      aportePorJugador: p.aporte_por_jugador,
      posicionDeseada: p.posicion_deseada,
      fechaPreferida: p.fecha_preferida,
      rangoHoraInicio: p.rango_hora_inicio,
      rangoHoraFin: p.rango_hora_fin,
      zona: p.zona,
      fechaPublicacion: p.fecha_publicacion.toISOString(),
      equipoPublicador: resumen(p.equipo_publicador_id),
      equipoRival: p.equipo_rival_id ? resumen(p.equipo_rival_id) : null,
      reserva: r
        ? { id: r.id, fecha: r.fecha, horaInicio: r.horaInicio, horaFin: r.horaFin, tipoFutbol: r.cancha.tipoFutbol, cancha: r.cancha.nombre, complejo: { id: r.complejo.id, nombre: r.complejo.nombre, ciudad: r.complejo.ciudad, barrio: r.complejo.barrio, direccion: r.complejo.direccion }, precioTotal: r.precioTotal }
        : null,
      valorPorEquipo: r && p.modalidad !== 'faltan_jugadores' ? dividirValor(r.precioTotal, p.porcentaje_pago_rival) : null,
    };
  });
}

const contiene = (texto: string | null | undefined, buscado: string) => (texto ?? '').toLocaleLowerCase('es').includes(buscado.toLocaleLowerCase('es'));

/** HU-23.1: un partido cumple los filtros de fecha, horas, lugar, modalidad y nivel. */
function cumpleFiltros(p: PartidoDto, f: FiltrosPartidos): boolean {
  if (f.nivel && p.nivelBuscado !== f.nivel) return false;
  if (f.modalidad && p.modalidad !== f.modalidad) return false;
  const tipo = p.reserva?.tipoFutbol ?? p.equipoPublicador.tipoFutbol;
  if (f.tipoFutbol && tipo !== f.tipoFutbol) return false;
  const fecha = p.reserva?.fecha ?? p.fechaPreferida;
  if (f.fecha && fecha !== f.fecha) return false;
  const inicio = p.reserva?.horaInicio ?? p.rangoHoraInicio;
  if (inicio) {
    if (f.horaDesde && horaAMinutos(inicio) < horaAMinutos(f.horaDesde)) return false;
    if (f.horaHasta && horaAMinutos(inicio) >= horaAMinutos(f.horaHasta)) return false;
  }
  if (f.ciudad && !(p.reserva ? contiene(p.reserva.complejo.ciudad, f.ciudad) : contiene(p.zona, f.ciudad))) return false;
  if (f.barrio && !(p.reserva ? contiene(p.reserva.complejo.barrio, f.barrio) : contiene(p.zona, f.barrio))) return false;
  return true;
}

function vigente(p: PartidoDto, reservaActiva: Set<number>, ahora: Date): boolean {
  if (p.reserva) return reservaActiva.has(p.reserva.id) && !empezo(p.reserva, ahora);
  return !!p.fechaPreferida && !!p.rangoHoraFin && instanteBogota(p.fechaPreferida, p.rangoHoraFin) > ahora;
}

export const matchmakingService = {
  /** HU-22 y HU-25: publicar un partido abierto. */
  async publicar(usuario: UsuarioSesion, d: PublicarDto, ahora = new Date()): Promise<PartidoDto> {
    let id: number;
    try {
      id = await withTransaction(async (db) => {
        if (d.modalidad === 'busco_partido_sin_cancha') {
          const e = await equipoCapitaneado(d.equipoId, usuario, db, true);
          asegurarNoSuspendido(e, ahora);
          if (d.rangoHoraFin <= d.rangoHoraInicio) throw AppError.validacion([{ campo: 'rangoHoraFin', mensaje: 'La hora final debe ser posterior a la inicial' }]);
          if (instanteBogota(d.fechaPreferida, d.rangoHoraFin) <= ahora) throw AppError.validacion([{ campo: 'fechaPreferida', mensaje: 'La fecha ya pasó' }]);
          return repo.crear(
            { reservaId: null, equipoId: e.id, modalidad: d.modalidad, nivelBuscado: d.nivelBuscado, descripcion: d.descripcion ?? null, fechaPreferida: d.fechaPreferida, rangoHoraInicio: d.rangoHoraInicio, rangoHoraFin: d.rangoHoraFin, zona: d.zona },
            db,
          );
        }
        const r = await bookingsApi.obtener(d.reservaId, db, true);
        if (!r || r.usuarioId !== usuario.id) throw AppError.noEncontrado('RESERVA_NO_ENCONTRADA', 'La reserva no existe');
        await validarReservaPublicable(r, ahora, db); // RN-09
        const e = await equipoCapitaneado(d.equipoId, usuario, db, true);
        asegurarNoSuspendido(e, ahora);
        if (r.cancha.tipoFutbol !== e.tipoFutbol) throw AppError.conflicto('MODALIDAD_INCOMPATIBLE', `Tu equipo es de fútbol ${e.tipoFutbol} y la cancha de fútbol ${r.cancha.tipoFutbol}.`);
        if (await repo.activoDeReserva(r.id, db)) throw AppError.conflicto('YA_PUBLICADA', 'Esta reserva ya está publicada en Busca Partido.');
        await asegurarSinCruce(e.id, r, null, db); // RN-11
        if (d.modalidad === 'faltan_jugadores') {
          if (!cuposValidos(d.cuposDisponibles, r.cancha.tipoFutbol)) {
            throw AppError.validacion([{ campo: 'cuposDisponibles', mensaje: `Máximo ${maximoDeCupos(r.cancha.tipoFutbol)} cupos en fútbol ${r.cancha.tipoFutbol}` }]); // RN-10
          }
          return repo.crear({ reservaId: r.id, equipoId: e.id, modalidad: d.modalidad, nivelBuscado: d.nivelBuscado, descripcion: d.descripcion ?? null, cupos: d.cuposDisponibles, aporte: d.aportePorJugador, posicionDeseada: d.posicionDeseada }, db);
        }
        return repo.crear({ reservaId: r.id, equipoId: e.id, modalidad: d.modalidad, nivelBuscado: d.nivelBuscado, descripcion: d.descripcion ?? null, porcentajePagoRival: d.porcentajePagoRival, aceptacionAutomatica: d.aceptacionAutomatica }, db);
      });
    } catch (err) {
      if (esErrorPg(err, PG_ERRORES.UNIQUE, 'partido_reserva_activa_uk')) throw AppError.conflicto('YA_PUBLICADA', 'Esta reserva ya está publicada en Busca Partido.');
      throw err;
    }
    await eventBus.emit('PartidoPublicado', { partidoId: id, equipoId: d.equipoId });
    return (await aDtos([(await repo.obtener(id))!]))[0]!;
  },

  /** HU-23: solo partidos que siguen buscando y no han empezado. */
  async explorar(f: FiltrosPartidos, ahora = new Date()): Promise<PartidoDto[]> {
    const filas = await repo.buscando();
    const reservas = await bookingsApi.porIds(filas.flatMap((p) => (p.reserva_id ? [p.reserva_id] : [])));
    const activas = new Set(reservas.filter((r) => estaActiva(r.estado)).map((r) => r.id));
    // Un equipo inactivo o suspendido no aparece en la búsqueda (H1, RN-08).
    const publicadores = await teamsApi.porIds([...new Set(filas.map((p) => p.equipo_publicador_id))]);
    const habilitados = new Set(publicadores.filter((e) => e.estado === 'activo' && !estaSuspendido(e.suspendidoHasta, ahora)).map((e) => e.id));
    return (await aDtos(filas)).filter((p) => habilitados.has(p.equipoPublicador.id) && vigente(p, activas, ahora) && cumpleFiltros(p, f));
  },

  /** HU-23.3: detalle con el perfil del equipo publicador y sus últimos resultados. */
  async detalle(id: number, usuario?: UsuarioSesion) {
    const fila = await repo.obtener(id);
    if (!fila) throw noExiste();
    const partido = (await aDtos([fila]))[0]!;
    const resultados = await repo.ultimosResultados(fila.equipo_publicador_id);
    const publicador = (await teamsApi.obtener(fila.equipo_publicador_id))!;
    return {
      partido,
      ultimosResultados: resultados.map((r) => ({
        partidoId: r.id,
        golesPropios: r.equipo_publicador_id === fila.equipo_publicador_id ? r.goles_publicador : r.goles_rival,
        golesRival: r.equipo_publicador_id === fila.equipo_publicador_id ? r.goles_rival : r.goles_publicador,
        fecha: r.fecha_publicacion.toISOString(),
      })),
      esCapitanPublicador: usuario?.id === publicador.capitanId,
      ...(await miParticipacion(id, usuario)),
    };
  },

  /** HU-21.1: los partidos del equipo solo los ven sus miembros. */
  async partidosDeEquipo(equipoId: number, usuario: UsuarioSesion): Promise<PartidoDto[]> {
    if (!(await teamsApi.esMiembro(equipoId, usuario.id)) && usuario.rol !== 'Superadmin') throw AppError.prohibido('Solo los miembros del equipo pueden ver sus partidos.');
    return aDtos(await repo.deEquipo(equipoId));
  },

  /** El capitán publicador retira su partido; la reserva sigue siendo suya. */
  async cancelar(id: number, usuario: UsuarioSesion, ahora = new Date()): Promise<PartidoDto> {
    const p = await withTransaction(async (db) => {
      const fila = await repo.obtener(id, db, true);
      if (!fila) throw noExiste();
      await equipoCapitaneado(fila.equipo_publicador_id, usuario, db);
      if (!['buscando', 'rival_confirmado', 'completo'].includes(fila.estado)) throw AppError.conflicto('PARTIDO_CERRADO', 'Este partido ya no se puede cancelar.');
      const r = fila.reserva_id ? await bookingsApi.obtener(fila.reserva_id, db) : undefined;
      if (r && empezo(r, ahora)) throw AppError.conflicto('PARTIDO_INICIADO', 'El partido ya empezó; no se puede cancelar.');
      const aceptados = await repo.jugadoresAceptados(id, db);
      await repo.cancelar(id, db);
      return { ...fila, aceptados };
    });
    await eventBus.emit('PartidoCancelado', { partidoId: id, equipoPublicadorId: p.equipo_publicador_id, equipoRivalId: p.equipo_rival_id, jugadores: p.aceptados, motivo: 'capitan' });
    return (await aDtos([(await repo.obtener(id))!]))[0]!;
  },

  /** HU-24: postular a un equipo como rival; con aceptación automática queda confirmado de una vez. */
  async postular(partidoId: number, usuario: UsuarioSesion, equipoId: number, ahora = new Date()) {
    const res = await withTransaction(async (db) => {
      const p = await repo.obtener(partidoId, db, true);
      if (!p) throw noExiste();
      if (p.modalidad !== 'busco_rival') throw AppError.conflicto('MODALIDAD_INVALIDA', 'Este partido no busca equipo rival.');
      const r = (await asegurarAbierto(p, ahora, db))!;
      if (equipoId === p.equipo_publicador_id) throw AppError.conflicto('MISMO_EQUIPO', 'Un equipo no puede jugar contra sí mismo.');
      asegurarContraparte(await teamsApi.obtener(p.equipo_publicador_id, db), ahora);
      const e = await equipoCapitaneado(equipoId, usuario, db, true);
      asegurarNoSuspendido(e, ahora);
      if (e.tipoFutbol !== r.cancha.tipoFutbol) throw AppError.conflicto('MODALIDAD_INCOMPATIBLE', `Tu equipo es de fútbol ${e.tipoFutbol} y este partido de fútbol ${r.cancha.tipoFutbol}.`);
      await asegurarSinCruce(e.id, r, null, db); // RN-11, HU-24.4
      const post = await repo.crearPostulacion(partidoId, equipoId, db);
      if (!post) throw AppError.conflicto('YA_POSTULADO', 'Tu equipo ya se postuló a este partido.');
      let rechazados: number[] = [];
      if (p.aceptacion_automatica) {
        rechazados = await confirmar(p.id, post.id, e.id, null, db);
      }
      return { p, postulacionId: post.id, auto: p.aceptacion_automatica, rechazados };
    });
    if (res.auto) await eventBus.emit('RivalConfirmado', { partidoId, equipoPublicadorId: res.p.equipo_publicador_id, equipoRivalId: equipoId, equiposRechazados: res.rechazados });
    else await eventBus.emit('PostulacionRecibida', { partidoId, postulacionId: res.postulacionId, equipoId, equipoPublicadorId: res.p.equipo_publicador_id });
    return { postulacionId: res.postulacionId, confirmado: res.auto, partido: (await aDtos([(await repo.obtener(partidoId))!]))[0]! };
  },

  /** El capitán publicador ve las solicitudes. */
  async postulaciones(partidoId: number, usuario: UsuarioSesion): Promise<PostulacionDto[]> {
    const p = await repo.obtener(partidoId);
    if (!p) throw noExiste();
    await equipoCapitaneado(p.equipo_publicador_id, usuario);
    const filas = await repo.postulacionesDePartido(partidoId);
    const ids = filas.map((f) => f.equipo_id);
    const [equipos, fp] = await Promise.all([teamsApi.porIds(ids), reputacion(ids)]);
    const porId = new Map(equipos.map((e) => [e.id, e]));
    return filas.map((f) => {
      const e = porId.get(f.equipo_id)!;
      return { id: f.id, partidoId, estado: f.estado, fecha: f.fecha.toISOString(), equipo: { id: e.id, nombre: e.nombre, escudoUrl: e.escudoUrl, nivel: e.nivel, tipoFutbol: e.tipoFutbol, fairPlay: fp.get(e.id) ?? null } };
    });
  },

  /** HU-24.2: aceptar confirma al rival y rechaza a los demás (RN-10: un solo rival). */
  async responderPostulacion(postulacionId: number, usuario: UsuarioSesion, aceptar: boolean, ahora = new Date()) {
    const res = await withTransaction(async (db) => {
      const previa = await repo.obtenerPostulacion(postulacionId, db);
      if (!previa) throw AppError.noEncontrado('POSTULACION_NO_ENCONTRADA', 'La solicitud no existe');
      const p = (await repo.obtener(previa.partido_abierto_id, db, true))!;
      await equipoCapitaneado(p.equipo_publicador_id, usuario, db);
      const post = (await repo.obtenerPostulacion(postulacionId, db))!;
      if (post.estado !== 'pendiente') throw AppError.conflicto('POSTULACION_RESUELTA', 'Esta solicitud ya fue resuelta.');
      if (!aceptar) {
        await repo.cambiarEstadoPostulacion(post.id, 'rechazada', db);
        return { p, equipoId: post.equipo_id, aceptada: false, rechazados: [] as number[] };
      }
      const r = (await asegurarAbierto(p, ahora, db))!;
      const publicador = await teamsApi.obtener(p.equipo_publicador_id, db);
      asegurarNoSuspendido(publicador!, ahora);
      const rival = await teamsApi.bloquear(post.equipo_id, db);
      asegurarContraparte(rival, ahora);
      await asegurarSinCruce(rival!.id, r, null, db);
      return { p, equipoId: post.equipo_id, aceptada: true, rechazados: await confirmar(p.id, post.id, rival!.id, null, db) };
    });
    if (res.aceptada) await eventBus.emit('RivalConfirmado', { partidoId: res.p.id, equipoPublicadorId: res.p.equipo_publicador_id, equipoRivalId: res.equipoId, equiposRechazados: res.rechazados });
    else await eventBus.emit('PostulacionRechazada', { partidoId: res.p.id, equipoId: res.equipoId });
    return (await aDtos([(await repo.obtener(res.p.id))!]))[0]!;
  },

  async retirarPostulacion(postulacionId: number, usuario: UsuarioSesion): Promise<void> {
    await withTransaction(async (db) => {
      const post = await repo.obtenerPostulacion(postulacionId, db);
      if (!post) throw AppError.noEncontrado('POSTULACION_NO_ENCONTRADA', 'La solicitud no existe');
      await equipoCapitaneado(post.equipo_id, usuario, db);
      await repo.obtener(post.partido_abierto_id, db, true);
      const actual = (await repo.obtenerPostulacion(postulacionId, db))!;
      if (actual.estado !== 'pendiente') throw AppError.conflicto('POSTULACION_RESUELTA', 'Esta solicitud ya fue resuelta.');
      await repo.cambiarEstadoPostulacion(postulacionId, 'anulada', db);
    });
  },

  /** HU-22.4: un equipo con reserva acepta un "busco partido sin cancha". */
  async aceptarConReserva(partidoId: number, usuario: UsuarioSesion, equipoId: number, reservaId: number, ahora = new Date()) {
    let publicadorId: number;
    try {
      publicadorId = await withTransaction(async (db) => {
        const p = await repo.obtener(partidoId, db, true);
        if (!p) throw noExiste();
        if (p.modalidad !== 'busco_partido_sin_cancha' || p.reserva_id !== null) throw AppError.conflicto('MODALIDAD_INVALIDA', 'Este partido no busca una cancha.');
        if (p.estado !== 'buscando') throw AppError.conflicto('PARTIDO_CERRADO', 'Este partido ya no está disponible.');
        if (equipoId === p.equipo_publicador_id) throw AppError.conflicto('MISMO_EQUIPO', 'Un equipo no puede jugar contra sí mismo.');
        const r = await bookingsApi.obtener(reservaId, db, true);
        if (!r || r.usuarioId !== usuario.id) throw AppError.noEncontrado('RESERVA_NO_ENCONTRADA', 'La reserva no existe');
        await validarReservaPublicable(r, ahora, db);
        if (!reservaDentroDeLoPedido(r, { fechaPreferida: p.fecha_preferida!, rangoHoraInicio: p.rango_hora_inicio!, rangoHoraFin: p.rango_hora_fin! })) {
          throw AppError.conflicto('RESERVA_FUERA_DE_RANGO', 'Tu reserva no está dentro de la fecha y las horas que pide este equipo.');
        }
        // Dos equipos: se bloquean siempre en orden de id para no interbloquearse.
        const [a, b] = [equipoId, p.equipo_publicador_id].sort((x, y) => x - y) as [number, number];
        await teamsApi.bloquear(a, db);
        await teamsApi.bloquear(b, db);
        const e = await equipoCapitaneado(equipoId, usuario, db);
        asegurarNoSuspendido(e, ahora);
        if (e.tipoFutbol !== r.cancha.tipoFutbol) throw AppError.conflicto('MODALIDAD_INCOMPATIBLE', `Tu equipo es de fútbol ${e.tipoFutbol} y la cancha de fútbol ${r.cancha.tipoFutbol}.`);
        const publicador = await teamsApi.obtener(p.equipo_publicador_id, db);
        asegurarContraparte(publicador, ahora);
        if (publicador!.tipoFutbol !== r.cancha.tipoFutbol) throw AppError.conflicto('MODALIDAD_INCOMPATIBLE', 'La cancha no es de la modalidad del equipo que publicó.');
        await asegurarSinCruce(equipoId, r, p.id, db);
        await asegurarSinCruce(p.equipo_publicador_id, r, p.id, db);
        await repo.confirmarRival(p.id, equipoId, r.id, db);
        return p.equipo_publicador_id;
      });
    } catch (err) {
      if (esErrorPg(err, PG_ERRORES.UNIQUE, 'partido_reserva_activa_uk')) throw AppError.conflicto('YA_PUBLICADA', 'Esa reserva ya está publicada en otro partido.');
      throw err;
    }
    await eventBus.emit('RivalConfirmado', { partidoId, equipoPublicadorId: publicadorId, equipoRivalId: equipoId, equiposRechazados: [] });
    return (await aDtos([(await repo.obtener(partidoId))!]))[0]!;
  },

  // --- HU-25 ----------------------------------------------------------------------------------

  async inscribirse(partidoId: number, usuario: UsuarioSesion, posicion: string | null, ahora = new Date()) {
    const res = await withTransaction(async (db) => {
      const p = await repo.obtener(partidoId, db, true);
      if (!p) throw noExiste();
      if (p.modalidad !== 'faltan_jugadores') throw AppError.conflicto('MODALIDAD_INVALIDA', 'Este partido no busca jugadores.');
      await asegurarAbierto(p, ahora, db);
      asegurarContraparte(await teamsApi.obtener(p.equipo_publicador_id, db), ahora);
      if (await teamsApi.esMiembro(p.equipo_publicador_id, usuario.id, db)) throw AppError.conflicto('YA_ES_MIEMBRO', 'Ya eres parte del equipo que publicó este partido.');
      const ins = await repo.crearInscripcion(partidoId, usuario.id, posicion, db);
      if (!ins) throw AppError.conflicto('YA_INSCRITO', 'Ya solicitaste un cupo en este partido.');
      return { p, ins };
    });
    await eventBus.emit('InscripcionRecibida', { partidoId, inscripcionId: res.ins.id, usuarioId: usuario.id, equipoPublicadorId: res.p.equipo_publicador_id });
    return { id: res.ins.id, partidoId, estado: res.ins.estado, posicion: res.ins.posicion, aporte: res.p.aporte_por_jugador };
  },

  async inscripciones(partidoId: number, usuario: UsuarioSesion): Promise<InscripcionDto[]> {
    const p = await repo.obtener(partidoId);
    if (!p) throw noExiste();
    await equipoCapitaneado(p.equipo_publicador_id, usuario);
    const filas = await repo.inscripcionesDePartido(partidoId);
    const usuarios = await jugadores(filas.map((f) => f.usuario_id));
    return filas.map((f) => {
      const u = usuarios.get(f.usuario_id);
      return { id: f.id, partidoId, usuarioId: f.usuario_id, jugador: { username: u?.username ?? null, nombre: u?.nombre ?? null, fotoUrl: u?.fotoUrl ?? null }, posicion: f.posicion, estado: f.estado, fecha: f.fecha.toISOString() };
    });
  },

  /** HU-25.2 y 25.3: aceptar descuenta un cupo; con el último, el anuncio se cierra. */
  async responderInscripcion(inscripcionId: number, usuario: UsuarioSesion, aceptar: boolean, ahora = new Date()) {
    const res = await withTransaction(async (db) => {
      const previa = await repo.obtenerInscripcion(inscripcionId, db);
      if (!previa) throw AppError.noEncontrado('INSCRIPCION_NO_ENCONTRADA', 'La solicitud no existe');
      const p = (await repo.obtener(previa.partido_abierto_id, db, true))!;
      await equipoCapitaneado(p.equipo_publicador_id, usuario, db);
      const ins = (await repo.obtenerInscripcion(inscripcionId, db))!;
      if (ins.estado !== 'pendiente') throw AppError.conflicto('INSCRIPCION_RESUELTA', 'Esta solicitud ya fue resuelta.');
      const avisados: number[] = [];
      if (aceptar) {
        await asegurarAbierto(p, ahora, db);
        asegurarNoSuspendido((await teamsApi.obtener(p.equipo_publicador_id, db))!, ahora);
        const t = trasAceptarJugador(p.cupos_disponibles ?? 0);
        await repo.cambiarEstadoInscripcion(ins.id, 'aceptada', db);
        await repo.actualizarCupos(p.id, t.cupos, t.estado, db);
        if (t.estado === 'completo') avisados.push(...(await repo.rechazarInscripcionesPendientes(p.id, db)).map((x) => x.usuario_id));
      } else {
        await repo.cambiarEstadoInscripcion(ins.id, 'rechazada', db);
      }
      return { p, ins, avisados };
    });
    await eventBus.emit('InscripcionResuelta', { partidoId: res.p.id, inscripcionId, usuarioId: res.ins.usuario_id, aceptada: aceptar });
    for (const usuarioId of res.avisados) await eventBus.emit('InscripcionResuelta', { partidoId: res.p.id, inscripcionId: null, usuarioId, aceptada: false });
    return (await aDtos([(await repo.obtener(res.p.id))!]))[0]!;
  },

  /** El jugador retira su solicitud; si ya tenía cupo aceptado, el cupo vuelve a quedar libre. */
  async retirarInscripcion(inscripcionId: number, usuario: UsuarioSesion, ahora = new Date()): Promise<void> {
    await withTransaction(async (db) => {
      const previa = await repo.obtenerInscripcion(inscripcionId, db);
      if (!previa || previa.usuario_id !== usuario.id) throw AppError.noEncontrado('INSCRIPCION_NO_ENCONTRADA', 'La solicitud no existe');
      const p = (await repo.obtener(previa.partido_abierto_id, db, true))!;
      const ins = await repo.obtenerInscripcion(inscripcionId, db);
      if (!ins || ins.estado === 'rechazada') throw AppError.conflicto('INSCRIPCION_RESUELTA', 'Esta solicitud ya fue resuelta.');
      if (ins.estado === 'aceptada') {
        const r = p.reserva_id ? await bookingsApi.obtener(p.reserva_id, db) : undefined;
        if (r && empezo(r, ahora)) throw AppError.conflicto('PARTIDO_INICIADO', 'El partido ya empezó.');
        if (p.estado === 'buscando' || p.estado === 'completo') await repo.actualizarCupos(p.id, (p.cupos_disponibles ?? 0) + 1, 'buscando', db);
      }
      await repo.eliminarInscripcion(ins.id, db);
    });
  },

  /**
   * HU-12.4 y cierre del partido cuando la reserva termina. Idempotente: lo usan los eventos y la
   * reconciliación periódica, por si un evento se perdió.
   * - Se completó con rival o cupos llenos → "jugado". En cualquier otro caso → "cancelado".
   */
  async cerrarPorReserva(reservaId: number, estadoReserva: 'cancelada' | 'expirada' | 'completada' | 'no_asistio'): Promise<void> {
    const res = await withTransaction(async (db) => {
      const fila = await repo.activoDeReserva(reservaId, db);
      if (!fila) return undefined;
      if (estadoReserva === 'completada' && fila.estado !== 'buscando') {
        await repo.marcarJugado(fila.id, db);
        return { fila, jugado: true, aceptados: [] as number[] };
      }
      const aceptados = await repo.jugadoresAceptados(fila.id, db);
      await repo.cancelar(fila.id, db);
      return { fila, jugado: false, aceptados };
    });
    if (!res) return;
    const { fila } = res;
    if (res.jugado) await eventBus.emit('PartidoJugado', { partidoId: fila.id, equipoPublicadorId: fila.equipo_publicador_id, equipoRivalId: fila.equipo_rival_id });
    else await eventBus.emit('PartidoCancelado', { partidoId: fila.id, equipoPublicadorId: fila.equipo_publicador_id, equipoRivalId: fila.equipo_rival_id, jugadores: res.aceptados, motivo: 'reserva_cancelada' });
  },

  /** Reconciliación (M1): cierra los partidos activos cuya reserva ya terminó. Devuelve cuántos revisó y cerró. */
  async reconciliar(): Promise<number> {
    const activos = await repo.activosConReserva();
    const reservas = await bookingsApi.porIds(activos.map((a) => a.reserva_id));
    let cerrados = 0;
    for (const r of reservas) {
      if (r.estado === 'cancelada' || r.estado === 'expirada' || r.estado === 'completada' || r.estado === 'no_asistio') {
        await this.cerrarPorReserva(r.id, r.estado);
        cerrados++;
      }
    }
    return cerrados;
  },

  /** Un equipo inactivo sale de Busca Partido: sus publicaciones se cancelan y, si era rival, el partido vuelve a buscar. */
  async retirarEquipo(equipoId: number): Promise<void> {
    const eventos = await withTransaction(async (db) => {
      await repo.anularPostulacionesPendientes(equipoId, db);
      const res: { fila: PartidoFila; aceptados: number[] }[] = [];
      for (const fila of await repo.activosDeEquipo(equipoId, db)) {
        if (fila.equipo_publicador_id === equipoId) {
          const aceptados = await repo.jugadoresAceptados(fila.id, db);
          await repo.cancelar(fila.id, db);
          res.push({ fila, aceptados });
        } else {
          await repo.liberarRival(fila.id, equipoId, db);
          res.push({ fila, aceptados: [] });
        }
      }
      return res;
    });
    for (const { fila, aceptados } of eventos) {
      if (fila.equipo_publicador_id === equipoId) await eventBus.emit('PartidoCancelado', { partidoId: fila.id, equipoPublicadorId: equipoId, equipoRivalId: fila.equipo_rival_id, jugadores: aceptados, motivo: 'equipo_inactivo' });
      else await eventBus.emit('RivalRetirado', { partidoId: fila.id, equipoPublicadorId: fila.equipo_publicador_id, equipoRivalId: equipoId });
    }
  },

  reservasConPartido: (ids: number[]) => repo.reservasConPartido(ids),
};

/** HU-24 y HU-25: la solicitud propia, para poder verla y retirarla. */
async function miParticipacion(partidoId: number, usuario?: UsuarioSesion) {
  if (!usuario) return { miPostulacion: null, miInscripcion: null };
  const capitaneados = await teamsApi.capitaneadosPor(usuario.id);
  const [post, ins] = await Promise.all([
    capitaneados.length ? repo.postulacionDeEquipos(partidoId, capitaneados) : undefined,
    repo.inscripcionDeUsuario(partidoId, usuario.id),
  ]);
  return {
    miPostulacion: post ? { id: post.id, equipoId: post.equipo_id, estado: post.estado } : null,
    miInscripcion: ins ? { id: ins.id, estado: ins.estado, posicion: ins.posicion } : null,
  };
}

/** RN-10 / HU-24.2: confirma un rival y rechaza las demás solicitudes. Devuelve los equipos rechazados. */
async function confirmar(partidoId: number, postulacionId: number, equipoRivalId: number, reservaId: number | null, db: Queryable): Promise<number[]> {
  await repo.cambiarEstadoPostulacion(postulacionId, 'aceptada', db);
  await repo.confirmarRival(partidoId, equipoRivalId, reservaId, db);
  return (await repo.rechazarDemasPostulaciones(partidoId, postulacionId, db)).map((x) => x.equipo_id);
}
