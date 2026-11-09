import { ApiError } from '../../lib/api';

/** Mensaje de un campo concreto a partir de los `detalles` de la API (o undefined). */
export function errorDeCampo(err: unknown, campo: string): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  return err.detalles.find((d) => d.campo === campo)?.mensaje;
}

/** Mensaje general: solo si el error no se puede atribuir a un campo del formulario. */
export function errorGeneral(err: unknown, campos: string[]): string | null {
  if (err === null || err === undefined) return null;
  if (err instanceof ApiError) {
    if (err.detalles.length > 0 && err.detalles.every((d) => campos.includes(d.campo))) return null;
    return err.mensaje;
  }
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}

export function codigoError(err: unknown): string | null {
  return err instanceof ApiError ? err.codigo : null;
}
