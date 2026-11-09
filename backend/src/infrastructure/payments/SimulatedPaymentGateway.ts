import { randomUUID } from 'node:crypto';
import type { PaymentGateway, ResultadoTransaccion, SolicitudCobro } from './PaymentGateway';

/**
 * Pasarela simulada (HT-08 criterio 2): permite probar ambos flujos.
 * - Tarjeta: un número que termina en 0002 se rechaza ("fondos insuficientes"); cualquier otro se aprueba.
 * - PSE / Nequi: `datos.resultado = 'rechazado'` simula el rechazo.
 * Nunca guarda datos de tarjeta: solo decide con los últimos dígitos.
 */
export class SimulatedPaymentGateway implements PaymentGateway {
  readonly nombre = 'simulado';
  private readonly transacciones = new Map<string, ResultadoTransaccion & { valor: number; reembolsado: number }>();

  async cobrar(s: SolicitudCobro): Promise<ResultadoTransaccion> {
    const tarjeta = (s.datos?.numeroTarjeta ?? '').replace(/\D/g, '');
    const rechazar = (s.metodo === 'tarjeta' && tarjeta.endsWith('0002')) || s.datos?.resultado === 'rechazado';
    const resultado: ResultadoTransaccion = {
      estado: rechazar ? 'rechazado' : 'aprobado',
      referencia: `SIM-${randomUUID()}`,
      mensaje: rechazar ? 'Pago rechazado por la entidad financiera (simulado).' : 'Pago aprobado (simulado).',
    };
    this.transacciones.set(resultado.referencia, { ...resultado, valor: s.valor, reembolsado: 0 });
    return resultado;
  }

  async consultarEstado(referencia: string): Promise<ResultadoTransaccion> {
    const t = this.transacciones.get(referencia);
    return t ? { estado: t.estado, referencia, mensaje: t.mensaje } : { estado: 'pendiente', referencia, mensaje: 'Transacción desconocida.' };
  }

  async reembolsar(referencia: string, valor: number): Promise<ResultadoTransaccion> {
    const t = this.transacciones.get(referencia);
    if (t) t.reembolsado += valor;
    return { estado: 'aprobado', referencia: `SIM-REEMB-${randomUUID()}`, mensaje: 'Reembolso aprobado (simulado).' };
  }
}
