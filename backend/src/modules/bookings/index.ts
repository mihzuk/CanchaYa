/**
 * API pública del módulo bookings (EP-03): lo único que otros módulos pueden importar.
 */
import { registrarConsultaReservas } from '../venues';
import './bookings.events';
import { bookingsInterno, bookingsService, reservarEnTransaccion } from './bookings.service';

export { bookingsRoutes } from './bookings.routes';
export { registrarMarcadorPartidos, registrarResolverNombres, type DatosReserva } from './bookings.service';
export type { ReservaExpiradaFila } from './bookings.repository';
export { ESTADOS_ACTIVOS, estaActiva, horasDeAnticipacion, type EstadoReserva } from './domain/booking-rules';
export { puedeReprogramar, calcularTraslado, HORAS_MIN_REPROGRAMACION } from './domain/reschedule';
export type { ReservaDto } from './bookings.dto';
export type { ReservaInterna } from './bookings.repository';

let iniciado = false;

/** Conecta el módulo con el resto del sistema. Idempotente. */
export function iniciarModuloBookings(): void {
  if (iniciado) return;
  iniciado = true;
  // HU-07.3 y HU-09.2: venues advierte de las reservas activas al cambiar horarios o bloquear.
  registrarConsultaReservas((f, db) =>
    bookingsInterno.activas({ canchaIds: f.canchaId ? [f.canchaId] : undefined, complejoId: f.complejoId, desdeFecha: f.desdeFecha, hastaFecha: f.hastaFecha }, db),
  );
}

/** Operaciones para payments, matchmaking, ratings y las tareas programadas. */
export const bookingsApi = {
  ...bookingsInterno,
  reservarEnTransaccion,
  expirarVencidas: (ahora?: Date) => bookingsService.expirarVencidas(ahora),
};
