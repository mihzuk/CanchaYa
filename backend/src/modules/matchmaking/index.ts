/**
 * API pública del módulo matchmaking (EP-06): lo único que otros módulos pueden importar.
 */
import { eventBus } from '../../shared/events/eventBus';
import { registrarMarcadorPartidos } from '../bookings';
import './matchmaking.events';
import { matchmakingService } from './matchmaking.service';

export { matchmakingRoutes } from './matchmaking.routes';
export { registrarDirectorioJugadores, registrarReputacionEquipos } from './matchmaking.service';
export { estaSuspendido, debeSuspenderse, finDeSuspension } from './domain/suspension';
export type { PartidoDto } from './matchmaking.dto';

let iniciado = false;

/** Conecta el módulo con el resto del sistema. Idempotente. */
export function iniciarModuloMatchmaking(): void {
  if (iniciado) return;
  iniciado = true;
  // HU-10.2: las franjas con partido abierto se ven en amarillo.
  registrarMarcadorPartidos((ids) => matchmakingService.reservasConPartido(ids));
  // HU-12.4: una reserva cancelada o reprogramada cierra su partido.
  eventBus.on('ReservaCancelada', ({ reservaId }) => matchmakingService.cerrarPorReserva(reservaId, 'cancelada'));
  eventBus.on('ReservaReprogramada', ({ reservaAnteriorId }) => matchmakingService.cerrarPorReserva(reservaAnteriorId, 'cancelada'));
  // H2: al terminar la reserva, el partido se cierra.
  eventBus.on('ReservaEstadoCambiado', ({ reservaId, estado }) => matchmakingService.cerrarPorReserva(reservaId, estado));
  eventBus.on('EquipoInactivado', ({ equipoId }) => matchmakingService.retirarEquipo(equipoId));
}

/** Para las tareas programadas. */
export const matchmakingApi = {
  reconciliar: () => matchmakingService.reconciliar(),
};
