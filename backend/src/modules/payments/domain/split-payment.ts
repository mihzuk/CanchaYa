import { porcentajeDe } from '../../../shared/utils/money';

/**
 * HU-26: el valor de la cancha se divide entre el equipo publicador y el rival (50 % por defecto,
 * o el porcentaje acordado al publicar). El redondeo al peso se compensa en el publicador para que
 * la suma sea exactamente el total.
 */
export function dividirValor(total: number, porcentajeRival: number): { publicador: number; rival: number } {
  if (porcentajeRival < 0 || porcentajeRival > 100) throw new Error('El porcentaje del rival debe estar entre 0 y 100');
  const rival = porcentajeDe(total, porcentajeRival);
  return { publicador: total - rival, rival };
}

/** HU-26: el abono de un equipo es su parte multiplicada por el mismo porcentaje de abono de la reserva. */
export function abonoDeParte(parte: number, precioTotal: number, abonoRequerido: number): number {
  if (precioTotal <= 0) return 0;
  return Math.min(parte, Math.round((parte * abonoRequerido) / precioTotal));
}

/** Cuánto ha pagado cada equipo de su parte (HU-17.2). */
export function avanceDePago(parte: number, pagado: number): { parte: number; pagado: number; pendiente: number } {
  return { parte, pagado, pendiente: Math.max(0, parte - pagado) };
}
