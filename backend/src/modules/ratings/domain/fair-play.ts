/** Los promedios se calculan, no se almacenan. Un decimal; `null` si no hay datos. */
export function promedio(valores: readonly number[]): number | null {
  if (!valores.length) return null;
  return Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;
}
