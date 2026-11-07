import { ApiError } from '../../lib/api';

export type Errores = Record<string, string>;

export function validarUsername(v: string): string | undefined {
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(v))
    return 'Usa entre 3 y 30 caracteres: letras, números, guion bajo o punto.';
  return undefined;
}

export function validarContrasena(v: string): string | undefined {
  if (v.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (v.length > 72) return 'La contraseña no puede superar los 72 caracteres.';
  if (!/[a-zA-Z]/.test(v) || !/[0-9]/.test(v)) return 'Incluye al menos una letra y un número.';
  return undefined;
}

export function validarCelular(v: string): string | undefined {
  if (!/^\+?[0-9]{7,15}$/.test(v)) return 'Ingresa entre 7 y 15 dígitos (puede iniciar con +).';
  return undefined;
}

export function validarCorreo(v: string): string | undefined {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Ingresa un correo válido.';
  return undefined;
}

export function validarObligatorio(v: string, nombre: string): string | undefined {
  if (!v.trim()) return `${nombre} es obligatorio.`;
  return undefined;
}

export function validarUrlHttps(v: string): string | undefined {
  if (!v) return undefined;
  try {
    if (new URL(v).protocol !== 'https:') throw new Error('no https');
  } catch {
    return 'La URL debe comenzar con https://';
  }
  return undefined;
}

/** Quita las entradas sin mensaje. */
export function limpiar(e: Record<string, string | undefined>): Errores {
  const out: Errores = {};
  for (const [k, v] of Object.entries(e)) if (v) out[k] = v;
  return out;
}

/** Convierte un error de la API en errores por campo y un mensaje general. */
export function erroresDeApi(err: unknown): { campos: Errores; general: string | null } {
  if (!(err instanceof ApiError)) {
    return { campos: {}, general: 'Ocurrió un error inesperado. Intenta de nuevo.' };
  }
  const campos: Errores = {};
  for (const d of err.detalles) campos[d.campo] = d.mensaje;
  return { campos, general: err.detalles.length ? null : err.mensaje };
}
