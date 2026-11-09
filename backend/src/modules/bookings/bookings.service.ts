import { esErrorPg, PG_ERRORES, withTransaction, type Queryable } from '../../shared/database/pool';
import { obtenerParametros } from '../../shared/config/parametros';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../shared/events/eventBus';
import { auditar } from '../../shared/logger/audit';
import type { UsuarioSesion } from '../../shared/middleware/authenticate';
import { generarCodigoReserva } from '../../shared/security/tokens';
import { instanteBogota, partesBogota, sumarDias, timestampLocal } from '../../shared/utils/time';
import {
  franjasDelDia,
  marcarFranjas,
  precioDeFranja,
  venuesApi,
  type CanchaBusquedaDto,
  type Horario,
  type TarifaDto,
} from '../venues';
import './bookings.events';
import type { BusquedaDto, CrearReservaDto, FranjaDisponibleDto, ReservaDto, ReservaManualDto, ResultadoBusquedaDto } from './bookings.dto';
import { bookingsRepository as repo, type ReservaExpiradaFila, type ReservaInterna } from './bookings.repository';
import { combinarConReservas, distanciaKm, enRangoDeHoras, sugerirCercanas } from './domain/availability';
import { calcularValores, MENSAJES_NO_RESERVABLE, validarReservable, type EstadoReserva, type MotivoNoReservable } from './domain/booking-rules';
import { fechaDeExpiracion } from './domain/expiration';

/** Máximo de reservas sin pagar al mismo tiempo por jugador (evita acaparar franjas). */
export const MAX_PENDIENTES_POR_USUARIO = 3;

// --- Marcador de Busca Partido (HU-10.2, amarillo) -------------------------------------------
// bookings no puede importar matchmaking (matchmaking depende de bookings): matchmaking registra aquí
// qué reservas tienen un partido abierto con cupos.
type MarcadorPartidos = (reservaIds: number[]) => Promise<Set<number>>;
let marcadorPartidos: MarcadorPartidos = async () => new Set();
export function registrarMarcadorPartidos(fn: MarcadorPartidos): void {
  marcadorPartidos = fn;
}

// --- Utilidades --------------------------------------------------------------------------------

const ahoraLocal = (ahora: Date) => {
  const p = partesBogota(ahora);
  return `${p.fecha}T${p.hora}`;
};

/** La reserva como la ve un jugador o un administrador (sin datos internos). */
function publica(r: ReservaInterna): ReservaDto {
  const { adminId: _a, ...dto } = r;
  return dto;
}

function puedeGestionar(r: ReservaInterna, u: UsuarioSesion): boolean {
  return u.rol === 'Superadmin' || r.adminId === u.id;
}

function puedeVer(r: ReservaInterna, u: UsuarioSesion): boolean {
  return r.usuarioId === u.id || puedeGestionar(r, u);
}

async function complejoDelAdministrador(complejoId: number, u: UsuarioSesion) {
  const complejo = await venuesApi.obtenerComplejo(complejoId);
  if (!complejo) throw AppError.noEncontrado('COMPLEJO_NO_ENCONTRADO', 'El complejo no existe');
  if (u.rol !== 'Superadmin' && complejo.adminId !== u.id) throw AppError.prohibido('Solo el administrador del complejo puede hacer esto.');
  return complejo;
}

function errorNoReservable(motivo: MotivoNoReservable, diasMax: number): AppError {
  const mensaje = MENSAJES_NO_RESERVABLE[motivo].replace('{dias}', String(diasMax));
  const status = motivo === 'FRANJA_BLOQUEADA' || motivo === 'SIN_TARIFA' ? 409 : 400;
  return new AppError(status, motivo, mensaje);
}

/** Franjas de un día por cancha, ya combinadas con reservas y bloqueos (cálculo en lote, RNF-04). */
async function franjasPorCancha(canchas: CanchaBusquedaDto[], fecha: string, ahora: Date): Promise<Map<number, FranjaDisponibleDto[]>> {
  const canchaIds = canchas.map((c) => c.id);
  const complejoIds = [...new Set(canchas.map((c) => c.complejo.id))];
  const [horarios, tarifas, bloqueos, reservas] = await Promise.all([
    venuesApi.horariosDeComplejos(complejoIds),
    venuesApi.tarifasDeCanchas(canchaIds),
    venuesApi.bloqueosDeCanchas(canchaIds, `${fecha} 00:00`, `${sumarDias(fecha, 1)} 00:00`),
    repo.activas({ canchaIds, desdeFecha: fecha, hastaFecha: fecha }),
  ]);
  const conPartido = reservas.length ? await marcadorPartidos(reservas.map((r) => r.id)) : new Set<number>();
  const local = ahoraLocal(ahora);

  const horariosPorComplejo = agrupar(horarios, (h) => h.complejoId);
  const tarifasPorCancha = agrupar(tarifas, (t) => t.canchaId);
  const bloqueosPorCancha = agrupar(bloqueos, (b) => b.canchaId);
  const reservasPorCancha = agrupar(reservas, (r) => r.canchaId);

  const resultado = new Map<number, FranjaDisponibleDto[]>();
  for (const cancha of canchas) {
    const tarifasCancha: TarifaDto[] = tarifasPorCancha.get(cancha.id) ?? [];
    const base = marcarFranjas(
      fecha,
      franjasDelDia(fecha, (horariosPorComplejo.get(cancha.complejo.id) ?? []) as Horario[]),
      (f) => precioDeFranja(fecha, f.horaInicio, tarifasCancha)?.precio ?? null,
      bloqueosPorCancha.get(cancha.id) ?? [],
      local,
    );
    resultado.set(cancha.id, combinarConReservas(base, reservasPorCancha.get(cancha.id) ?? [], conPartido));
  }
  return resultado;
}

function agrupar<T, K>(items: readonly T[], clave: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = clave(it);
    const lista = m.get(k);
    if (lista) lista.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** RN-02: avisa (después del COMMIT) de las reservas que expiraron. */
async function emitirExpiradas(expiradas: readonly ReservaExpiradaFila[]): Promise<void> {
  for (const r of expiradas) {
    await eventBus.emit('ReservaExpirada', { reservaId: r.id, usuarioId: r.usuarioId, canchaId: r.canchaId, fecha: r.fecha, horaInicio: r.horaInicio });
  }
}

// --- Nombres de los jugadores para el administrador (HU-14, HU-18) -----------------------------
// bookings no conoce la tabla de usuarios: la composición (app.ts) registra cómo resolverlos.
type ResolverNombres = (usuarioIds: number[]) => Promise<Map<number, string>>;
let resolverNombres: ResolverNombres = async () => new Map();
export function registrarResolverNombres(fn: ResolverNombres): void {
  resolverNombres = fn;
}
async function nombresDeJugadores(usuarioIds: (number | null)[]): Promise<Map<number, string>> {
  const ids = [...new Set(usuarioIds.filter((x): x is number => x !== null))];
  return ids.length ? resolverNombres(ids) : new Map();
}

// --- Núcleo de la reserva (HT-05) ----------------------------------------------------------------

export interface DatosReserva {
  canchaId: number;
  fecha: string;
  horaInicio: string;
  origen: 'web' | 'manual';
  usuarioId: number | null;
  nombreCliente?: string | null;
  celularCliente?: string | null;
  reprogramadaDeId?: number | null;
  /** Aquí se acumulan las retenciones vencidas que se liberaron, para avisarlas después del COMMIT. */
  expiradas?: ReservaExpiradaFila[];
  /** Para reprogramaciones: calcula los valores a partir del nuevo precio. */
  valores?: (precio: number, porcentajeAbono: number) => { precioTotal: number; abonoRequerido: number; saldoPendiente: number; estado: EstadoReserva };
}

/**
 * Crea una reserva dentro de una transacción existente:
 * 1. Bloquea la fila de la cancha (FOR UPDATE): las reservas y los bloqueos de la misma cancha se serializan.
 * 2. Libera retenciones vencidas (RN-02) y valida la franja (RN-06) y el precio (RN-04, RN-03).
 * 3. Inserta; la restricción de exclusión de la BD es la garantía final contra cruces (RN-01).
 */
export async function reservarEnTransaccion(db: Queryable, d: DatosReserva, ahora = new Date()): Promise<number> {
  const cancha = await venuesApi.obtenerCancha(d.canchaId, db);
  if (!cancha || cancha.estado !== 'activa' || cancha.estadoComplejo !== 'activo') {
    throw AppError.noEncontrado('CANCHA_NO_ENCONTRADA', 'La cancha no existe o no está disponible para reservas');
  }
  // Dentro de la transacción todo usa su conexión: pedir otra al pool podría agotarlo con muchas reservas a la vez.
  const complejo = await venuesApi.obtenerComplejo(cancha.complejoId, db);
  const parametros = await obtenerParametros(db);
  await venuesApi.bloquearCancha(d.canchaId, db);
  d.expiradas?.push(...(await repo.expirarVencidasDeCancha(d.canchaId, ahora, db)));

  const horarios = await venuesApi.listarHorarios(cancha.complejoId, db);
  const franjas = franjasDelDia(d.fecha, horarios);
  const franja = franjas.find((f) => f.horaInicio === d.horaInicio);
  const tarifas = await venuesApi.listarTarifas(d.canchaId, true, db);
  const bloqueada = franja
    ? await venuesApi.hayBloqueoEnRango(d.canchaId, timestampLocal(d.fecha, franja.horaInicio), timestampLocal(d.fecha, franja.horaFin), db)
    : false;

  const validacion = validarReservable({
    fecha: d.fecha,
    horaInicio: d.horaInicio,
    franjasDelDia: franjas,
    precio: precioDeFranja(d.fecha, d.horaInicio, tarifas)?.precio ?? null,
    bloqueada,
    diasAnticipacionMax: parametros.diasAnticipacionMax,
    ahora,
  });
  if (!validacion.ok) throw errorNoReservable(validacion.motivo, parametros.diasAnticipacionMax);

  const porcentajeAbono = complejo?.porcentajeAbono ?? parametros.abonoPctDefecto;
  const valores = d.valores
    ? d.valores(validacion.precio, porcentajeAbono)
    : { ...calcularValores(validacion.precio, porcentajeAbono), estado: (d.origen === 'manual' ? 'confirmada' : 'pendiente_pago') as EstadoReserva };

  try {
    return await repo.crear(
      {
        codigo: generarCodigoReserva(),
        usuarioId: d.usuarioId,
        canchaId: d.canchaId,
        fecha: d.fecha,
        horaInicio: d.horaInicio,
        horaFin: validacion.horaFin,
        ...valores,
        origen: d.origen,
        nombreCliente: d.nombreCliente,
        celularCliente: d.celularCliente,
        // RN-02: solo una reserva sin pago tiene vencimiento.
        fechaExpiracion: valores.estado === 'pendiente_pago' ? fechaDeExpiracion(ahora, parametros.retencionReservaMin) : null,
        reprogramadaDeId: d.reprogramadaDeId,
      },
      db,
    );
  } catch (err) {
    // HT-05 criterio 3
    if (esErrorPg(err, PG_ERRORES.EXCLUSION, 'reserva_sin_cruces')) {
      throw AppError.conflicto('FRANJA_NO_DISPONIBLE', 'La franja ya no está disponible');
    }
    throw err;
  }
}

export const bookingsService = {
  /** HU-10 criterio 1 y 3: complejos con canchas libres, precio y distancia; sugerencias si no hay resultados. */
  async buscarDisponibilidad(b: BusquedaDto, ahora = new Date()) {
    const { canchas, limitado } = await venuesApi.canchasParaBusqueda({ ciudad: b.ciudad, barrio: b.barrio, tipoFutbol: b.tipoFutbol });
    const franjas = await franjasPorCancha(canchas, b.fecha, ahora);
    const origen = b.lat !== undefined && b.lng !== undefined ? { lat: b.lat, lng: b.lng } : null;

    const porComplejo = new Map<number, ResultadoBusquedaDto>();
    const todasLibres: { complejo: ResultadoBusquedaDto['complejo']; cancha: { id: number; nombre: string; tipoFutbol: number }; franja: FranjaDisponibleDto }[] = [];
    for (const cancha of canchas) {
      const c = cancha.complejo;
      const info = {
        id: c.id,
        nombre: c.nombre,
        ciudad: c.ciudad,
        barrio: c.barrio,
        direccion: c.direccion,
        fotoPrincipal: c.fotoPrincipal,
        distanciaKm: origen && c.latitud !== null && c.longitud !== null ? distanciaKm(origen, { lat: c.latitud, lng: c.longitud }) : null,
      };
      const libres = (franjas.get(cancha.id) ?? []).filter((f) => f.estado === 'libre');
      for (const f of libres) todasLibres.push({ complejo: info, cancha: { id: cancha.id, nombre: cancha.nombre, tipoFutbol: cancha.tipoFutbol }, franja: f });
      const enRango = libres.filter((f) => enRangoDeHoras(f, b.horaDesde, b.horaHasta));
      if (!enRango.length) continue;
      const r = porComplejo.get(c.id) ?? { complejo: info, canchas: [], precioDesde: null };
      r.canchas.push({ id: cancha.id, nombre: cancha.nombre, tipoFutbol: cancha.tipoFutbol, techada: cancha.techada, iluminacion: cancha.iluminacion, franjas: enRango });
      const minimo = Math.min(...enRango.map((f) => f.precio ?? Infinity));
      r.precioDesde = r.precioDesde === null ? minimo : Math.min(r.precioDesde, minimo);
      porComplejo.set(c.id, r);
    }

    const resultados = [...porComplejo.values()].sort((a, b2) =>
      origen ? (a.complejo.distanciaKm ?? Infinity) - (b2.complejo.distanciaKm ?? Infinity) : (a.precioDesde ?? 0) - (b2.precioDesde ?? 0),
    );
    // HU-10.3: sin resultados en el rango, sugerir las franjas libres más cercanas a la hora pedida.
    const sugerencias =
      resultados.length === 0 && b.horaDesde
        ? sugerirCercanas(todasLibres.map((x) => ({ ...x, horaInicio: x.franja.horaInicio, estado: x.franja.estado })), b.horaDesde, 6).map(
            ({ complejo, cancha, franja }) => ({ complejo, cancha, franja }),
          )
        : [];
    // `limitado`: hay más canchas de las que se revisaron; conviene filtrar por ciudad o tipo.
    return { fecha: b.fecha, resultados, sugerencias, limitado };
  },

  /** HU-10 criterio 2: grilla por cancha (libre, reservada, bloqueada, partido abierto). */
  async disponibilidadDeComplejo(complejoId: number, fecha: string, ahora = new Date()) {
    const { canchas } = await venuesApi.canchasParaBusqueda({ complejoId });
    if (!canchas.length) {
      const complejo = await venuesApi.obtenerComplejo(complejoId);
      if (!complejo || complejo.estado !== 'activo') throw AppError.noEncontrado('COMPLEJO_NO_ENCONTRADO', 'El complejo no existe');
    }
    const franjas = await franjasPorCancha(canchas, fecha, ahora);
    return {
      fecha,
      canchas: canchas.map((c) => ({ id: c.id, nombre: c.nombre, tipoFutbol: c.tipoFutbol, franjas: franjas.get(c.id) ?? [] })),
    };
  },

  /** HU-11 criterio 1: reserva "pendiente de pago" retenida 15 minutos. */
  async crearReserva(usuario: UsuarioSesion, d: CrearReservaDto, ahora = new Date()): Promise<ReservaDto> {
    if (!usuario.correoVerificado) throw new AppError(403, 'CORREO_NO_VERIFICADO', 'Confirma tu correo antes de reservar.');
    const expiradas: ReservaExpiradaFila[] = [];
    const id = await withTransaction(async (db) => {
      await repo.bloquearUsuarioParaReservar(usuario.id, db);
      if ((await repo.contarPendientesDeUsuario(usuario.id, db)) >= MAX_PENDIENTES_POR_USUARIO) {
        throw AppError.conflicto(
          'DEMASIADAS_PENDIENTES',
          `Tienes ${MAX_PENDIENTES_POR_USUARIO} reservas sin pagar. Paga o espera a que venzan antes de reservar otra.`,
        );
      }
      return reservarEnTransaccion(db, { ...d, origen: 'web', usuarioId: usuario.id, expiradas }, ahora);
    });
    await emitirExpiradas(expiradas);
    auditar('reserva.creada', { usuarioId: usuario.id, entidad: 'reserva', entidadId: id, origen: 'web' });
    await eventBus.emit('ReservaCreada', { reservaId: id, usuarioId: usuario.id, canchaId: d.canchaId, fecha: d.fecha, horaInicio: d.horaInicio, origen: 'web' });
    return publica((await repo.obtener(id))!);
  },

  async obtenerReserva(id: number, usuario: UsuarioSesion): Promise<ReservaDto> {
    const r = await repo.obtener(id);
    // 404 también si no es suya: no se revela que la reserva existe.
    if (!r || !puedeVer(r, usuario)) throw AppError.noEncontrado('RESERVA_NO_ENCONTRADA', 'La reserva no existe');
    return publica(r);
  },

  /** HU-13 */
  async misReservas(usuario: UsuarioSesion, vista: 'proximas' | 'historial', ahora = new Date()): Promise<ReservaDto[]> {
    const p = partesBogota(ahora);
    return (await repo.listarDeUsuario(usuario.id, vista, p.fecha, p.hora)).map(publica);
  },

  /** HU-14 criterio 1: calendario del día con todas las canchas en columnas. */
  async calendarioDeComplejo(complejoId: number, usuario: UsuarioSesion, fecha: string) {
    await complejoDelAdministrador(complejoId, usuario);
    const [canchas, reservas] = await Promise.all([venuesApi.listarCanchas(complejoId, false), repo.listarDeComplejo(complejoId, fecha)]);
    const nombres = await nombresDeJugadores(reservas.map((r) => r.usuarioId));
    return { fecha, canchas, reservas: reservas.map((r) => ({ ...publica(r), nombreJugador: r.usuarioId ? (nombres.get(r.usuarioId) ?? null) : null })) };
  },

  /** HU-14 criterio 2: reserva manual (teléfono o en persona); ocupa la franja para todos. */
  async crearReservaManual(complejoId: number, usuario: UsuarioSesion, d: ReservaManualDto, ahora = new Date()): Promise<ReservaDto> {
    await complejoDelAdministrador(complejoId, usuario);
    const cancha = await venuesApi.obtenerCancha(d.canchaId);
    if (!cancha || cancha.complejoId !== complejoId) throw AppError.noEncontrado('CANCHA_NO_ENCONTRADA', 'La cancha no pertenece a este complejo');
    const expiradas: ReservaExpiradaFila[] = [];
    const id = await withTransaction((db) =>
      reservarEnTransaccion(
        db,
        { canchaId: d.canchaId, fecha: d.fecha, horaInicio: d.horaInicio, origen: 'manual', usuarioId: null, nombreCliente: d.nombreCliente, celularCliente: d.celularCliente, expiradas },
        ahora,
      ),
    );
    await emitirExpiradas(expiradas);
    auditar('reserva.creada', { usuarioId: usuario.id, entidad: 'reserva', entidadId: id, origen: 'manual' });
    await eventBus.emit('ReservaCreada', { reservaId: id, usuarioId: null, canchaId: d.canchaId, fecha: d.fecha, horaInicio: d.horaInicio, origen: 'manual' });
    return publica((await repo.obtener(id))!);
  },

  /** HU-14 criterios 3 y 4 (RN-07): marcar "No asistió" o "Completada" una vez empezado el partido. */
  async cambiarEstado(id: number, usuario: UsuarioSesion, estado: 'completada' | 'no_asistio', ahora = new Date()): Promise<ReservaDto> {
    const r = await withTransaction(async (db) => {
      const reserva = await repo.obtener(id, db, true);
      if (!reserva || !puedeGestionar(reserva, usuario)) throw AppError.noEncontrado('RESERVA_NO_ENCONTRADA', 'La reserva no existe');
      if (reserva.estado !== 'confirmada' && reserva.estado !== 'pagada') {
        throw AppError.conflicto('ESTADO_INVALIDO', 'Solo se puede cerrar una reserva confirmada o pagada.');
      }
      if (instanteBogota(reserva.fecha, reserva.horaInicio) > ahora) {
        throw AppError.conflicto('PARTIDO_NO_INICIADO', 'Solo puedes marcar la reserva cuando el partido ya empezó.');
      }
      // RN-07: "No asistió" no genera reembolso; queda en el historial del usuario.
      await repo.cambiarEstado(id, estado, db);
      return reserva;
    });
    auditar('reserva.estado', { usuarioId: usuario.id, entidad: 'reserva', entidadId: id, estado });
    await eventBus.emit('ReservaEstadoCambiado', { reservaId: id, usuarioId: r.usuarioId, estado });
    return publica((await repo.obtener(id))!);
  },

  /** HT-06 / RN-02: tarea programada. */
  async expirarVencidas(ahora = new Date()): Promise<number> {
    const expiradas = await repo.expirarVencidas(ahora);
    await emitirExpiradas(expiradas);
    return expiradas.length;
  },
};

/** Operaciones que usan payments (dentro de sus transacciones) y otros módulos. */
export const bookingsInterno = {
  /** M1: bloquea varias canchas siempre en el mismo orden (por id) para evitar interbloqueos. */
  async bloquearCanchas(ids: number[], db: Queryable): Promise<void> {
    for (const id of [...new Set(ids)].sort((a, b) => a - b)) await venuesApi.bloquearCancha(id, db);
  },
  idsDeComplejo: repo.idsDeComplejo,
  porIds: repo.porIds,
  nombresDeJugadores,
  emitirExpiradas,
  /** Lanza 403/404 si el usuario no administra el complejo. */
  asegurarAdminComplejo: complejoDelAdministrador,
  /** Complejo al que pertenece una cancha (o undefined si no existe). */
  async complejoDeCancha(canchaId: number, db?: Queryable): Promise<number | undefined> {
    return (await venuesApi.obtenerCancha(canchaId, db))?.complejoId;
  },
  obtener: repo.obtener,
  actualizarFinanzas: repo.actualizarFinanzas,
  cancelar: repo.cancelar,
  activas: repo.activas,
  deComplejo: repo.deComplejo,
  puedeGestionar,
  puedeVer,
  publica,
};
