import { porcentajeDe } from '../../../shared/utils/money';

/**
 * RN-05: política de cancelación.
 * - Más de 24 h antes del partido: reembolso del 100 % de lo pagado.
 * - Entre 6 y 24 h (ambos incluidos): 50 %.
 * - Menos de 6 h: sin reembolso.
 * Los porcentajes vienen de los parámetros globales (HU-33.3). Si cancela el complejo, siempre 100 %.
 */
export interface PoliticaReembolso {
  pct24h: number;
  pct6h: number;
}

export function porcentajeDeReembolso(horasDeAnticipacion: number, politica: PoliticaReembolso, canceladaPorComplejo = false): number {
  if (canceladaPorComplejo) return 100;
  if (horasDeAnticipacion > 24) return politica.pct24h;
  if (horasDeAnticipacion >= 6) return politica.pct6h;
  return 0;
}

/** Lo que aún se puede devolver de un pago (descontando reembolsos ya creados, pagados o no). */
export function disponibleParaReembolso(p: { valor: number; reembolsado: number; reembolsoPendiente: number }): number {
  return Math.max(0, p.valor - p.reembolsado - p.reembolsoPendiente);
}

/** Aplica el porcentaje a lo que queda por devolver de cada pago. No crea reembolsos en cero. */
export function reembolsosPorPago(pagos: readonly { id: number; disponible: number }[], porcentaje: number): { pagoId: number; valor: number }[] {
  if (porcentaje <= 0) return [];
  return pagos.map((p) => ({ pagoId: p.id, valor: porcentajeDe(p.disponible, porcentaje) })).filter((r) => r.valor > 0);
}

/**
 * HU-12.3: reparte un excedente entre los pagos, del más reciente al más antiguo, sin superar lo
 * disponible de cada uno. Devuelve los reembolsos y cuánto se pudo cubrir.
 */
export function repartirExcedente(
  pagosDelMasNuevo: readonly { id: number; disponible: number }[],
  excedente: number,
): { reembolsos: { pagoId: number; valor: number }[]; cubierto: number } {
  const reembolsos: { pagoId: number; valor: number }[] = [];
  let restante = excedente;
  for (const p of pagosDelMasNuevo) {
    if (restante <= 0) break;
    const valor = Math.min(restante, p.disponible);
    if (valor > 0) {
      reembolsos.push({ pagoId: p.id, valor });
      restante -= valor;
    }
  }
  return { reembolsos, cubierto: excedente - restante };
}
