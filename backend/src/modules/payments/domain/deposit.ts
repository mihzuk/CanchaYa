/**
 * RN-03: el abono mínimo es el porcentaje que configure el complejo (50 % por defecto).
 * Se valida contra lo acumulado: lo ya pagado más este pago debe cubrir el abono requerido.
 */
export function validarMontoAbono(params: { abonoRequerido: number; saldoPendiente: number; totalPagado: number; valor: number }): string | null {
  const { abonoRequerido, saldoPendiente, totalPagado, valor } = params;
  if (!Number.isInteger(valor) || valor <= 0) return 'El valor debe ser un número entero positivo.';
  if (valor > saldoPendiente) return 'El valor supera el saldo pendiente de la reserva.';
  if (totalPagado + valor < abonoRequerido) return `El abono mínimo es de ${abonoRequerido - totalPagado} pesos.`;
  return null;
}

/** Valor por defecto del abono en línea: lo que falta para cubrir el abono requerido. */
export function abonoFaltante(params: { abonoRequerido: number; saldoPendiente: number; totalPagado: number }): number {
  return Math.min(params.saldoPendiente, Math.max(0, params.abonoRequerido - params.totalPagado));
}

/**
 * Estado de la reserva después de un pago aprobado (HU-16, HU-17):
 * saldo 0 → "pagada"; abono cubierto → "confirmada"; si no, sigue "pendiente_pago".
 */
export function estadoTrasPago(params: { precioTotal: number; abonoRequerido: number; totalPagado: number }): {
  estado: 'pendiente_pago' | 'confirmada' | 'pagada';
  saldoPendiente: number;
} {
  const saldoPendiente = Math.max(0, params.precioTotal - params.totalPagado);
  if (saldoPendiente === 0) return { estado: 'pagada', saldoPendiente };
  return { estado: params.totalPagado >= params.abonoRequerido ? 'confirmada' : 'pendiente_pago', saldoPendiente };
}
