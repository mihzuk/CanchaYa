/**
 * API pública del módulo venues (EP-02): lo único que otros módulos pueden importar.
 */
import './venues.events';
import { venuesRepository } from './venues.repository';
import { venuesService } from './venues.service';

export { venuesRoutes } from './venues.routes';
export { registrarConsultaReservas, type ConsultaReservas } from './venues.service';
export { generarFranjas, seCruzan, franjaSeCruzaConRango, marcarFranjas, type Franja, type EstadoFranja, type RangoLocal } from './domain/slots';
export { horarioParaFecha, franjasDelDia, estaAbierto, type Horario } from './domain/schedule';
export { precioDeFranja, tipoDeDia, type TipoDia } from './domain/rates';
export type {
  CanchaBusquedaDto,
  CanchaDto,
  ComplejoDto,
  ComplejoResumenDto,
  FranjaDto,
  HorarioDto,
  TarifaDto,
  BloqueoDto,
  ReservaActivaDto,
} from './venues.dto';

/** Operaciones que usan bookings y admin. */
export const venuesApi = {
  franjasDeCancha: venuesService.franjasDeCancha.bind(venuesService),
  obtenerComplejo: venuesRepository.obtenerComplejo,
  obtenerCancha: venuesRepository.obtenerCancha,
  bloquearCancha: venuesRepository.bloquearCancha,
  listarHorarios: venuesRepository.listarHorarios,
  listarTarifas: venuesRepository.listarTarifas,
  listarBloqueos: venuesRepository.listarBloqueos,
  listarCanchas: venuesRepository.listarCanchas,
  canchasParaBusqueda: venuesRepository.canchasParaBusqueda,
  horariosDeComplejos: venuesRepository.horariosDeComplejos,
  tarifasDeCanchas: venuesRepository.tarifasDeCanchas,
  bloqueosDeCanchas: venuesRepository.bloqueosDeCanchas,
  hayBloqueoEnRango: venuesRepository.hayBloqueoEnRango,
  complejosPendientes: venuesService.complejosPendientes,
  resolverAprobacion: venuesService.resolverAprobacion,
};
