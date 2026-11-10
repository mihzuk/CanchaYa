/**
 * API pública del módulo payments (EP-04): lo único que otros módulos pueden importar.
 */
import './payments.events';

export { paymentsRoutes } from './payments.routes';
export { paymentsService as paymentsApi, registrarConsultaPartidoDeReserva } from './payments.service';
export { porcentajeDeReembolso } from './domain/refund-policy';
export { dividirValor, avanceDePago, abonoDeParte } from './domain/split-payment';
export type { PagoDto, ReembolsoDto, MetodoPago } from './payments.dto';
