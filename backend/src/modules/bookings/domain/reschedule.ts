import { porcentajeDe } from '../../../shared/utils/money';

/** HU-12 criterio 3: se puede reprogramar sin costo con más de 24 horas de anticipación. */
export const HORAS_MIN_REPROGRAMACION = 24;

export function puedeReprogramar(horasDeAnticipacion: number): boolean {
  return horasDeAnticipacion > HORAS_MIN_REPROGRAMACION;
}

/**
 * Valores de la nueva reserva cuando lo pagado se traslada (HU-12.3).
 * - El precio de la nueva franja queda fijo (RN-04) y lo pagado se descuenta del saldo.
 * - Una reserva que ya estaba confirmada sigue confirmada aunque la nueva franja sea más cara:
 *   la reprogramación es "sin costo" y el resto se paga en el complejo. Nunca vuelve a "pendiente de
 *   pago" (no puede expirar con dinero adentro).
 * - Si lo pagado supera el nuevo precio, el excedente se reembolsa.
 */
export function calcularTraslado(params: { pagado: number; nuevoPrecio: number; porcentajeAbono: number }): {
  precioTotal: number;
  abonoRequerido: number;
  saldoPendiente: number;
  estado: 'confirmada' | 'pagada';
  excedente: number;
} {
  const { pagado, nuevoPrecio, porcentajeAbono } = params;
  const saldoPendiente = Math.max(0, nuevoPrecio - pagado);
  return {
    precioTotal: nuevoPrecio,
    abonoRequerido: porcentajeDe(nuevoPrecio, porcentajeAbono),
    saldoPendiente,
    estado: saldoPendiente === 0 ? 'pagada' : 'confirmada',
    excedente: Math.max(0, pagado - nuevoPrecio),
  };
}
