import { ApiError } from '../../lib/api';

/** Mensaje legible de un error de la API (une los detalles por campo si los hay). */
export function mensajeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.detalles.length > 0) return err.detalles.map((d) => d.mensaje).join(' ');
    return err.mensaje;
  }
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Opciones de hora cada 30 minutos. `cierre` incluye 24:00 en lugar de 00:00. */
export function opcionesHora(cierre: boolean, actual?: string): { valor: string; etiqueta: string }[] {
  const out: string[] = [];
  for (let m = cierre ? 30 : 0; m <= (cierre ? 1440 : 1410); m += 30) {
    out.push(`${dosDigitos(Math.floor(m / 60))}:${dosDigitos(m % 60)}`);
  }
  const act = actual?.slice(0, 5);
  if (act && !out.includes(act)) out.push(act);
  out.sort();
  return out.map((v) => ({ valor: v, etiqueta: v }));
}

export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Convierte 'YYYY-MM-DDTHH:MM' en texto legible. */
export function formatFechaHora(v: string): string {
  const [f, h] = v.split(/[T ]/);
  return `${f ?? ''} ${h?.slice(0, 5) ?? ''}`.trim();
}
