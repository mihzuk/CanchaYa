import { env } from '../../shared/config/env';
import type { PaymentGateway } from './PaymentGateway';
import { SimulatedPaymentGateway } from './SimulatedPaymentGateway';

/** Elige la pasarela según PAYMENT_PROVIDER. Al integrar una real, se agrega aquí su caso. */
function crearPasarela(): PaymentGateway {
  switch (env.PAYMENT_PROVIDER) {
    case 'simulado':
    default:
      return new SimulatedPaymentGateway();
  }
}

export const pasarelaDePagos: PaymentGateway = crearPasarela();
export type { MetodoPagoEnLinea, PaymentGateway, ResultadoTransaccion, SolicitudCobro } from './PaymentGateway';
