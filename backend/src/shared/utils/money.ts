/**
 * Pesos colombianos (RNF-09). La API maneja valores enteros en pesos; la BD guarda NUMERIC(12,2).
 */
export function redondearCOP(valor: number): number {
  return Math.round(valor);
}

/** Porcentaje de un valor redondeado al peso: porcentajeDe(80000, 50) = 40000. */
export function porcentajeDe(valor: number, porcentaje: number): number {
  return redondearCOP((valor * porcentaje) / 100);
}

const formateador = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** formatearCOP(80000) -> "$ 80.000" */
export function formatearCOP(valor: number): string {
  return formateador.format(valor);
}
