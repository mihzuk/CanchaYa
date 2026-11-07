const TZ = 'America/Bogota';

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCOP(n: number): string {
  return copFmt.format(n).replace(/ /g, '');
}

const fechaFmt = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** 'YYYY-MM-DD' como fecha de calendario (sin desfase por zona horaria). */
export function formatFecha(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return fecha;
  return fechaFmt.format(new Date(Date.UTC(a, m - 1, d)));
}

export function formatHora(hora: string): string {
  return hora.slice(0, 5);
}

export function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
