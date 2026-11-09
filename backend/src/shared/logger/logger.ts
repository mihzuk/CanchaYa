import { env } from '../config/env';

/**
 * Logger estructurado en JSON (HT-14): una línea por evento con fecha ISO, nivel, mensaje y contexto
 * (endpoint, usuario, detalle). Nunca registrar contraseñas, tokens ni datos personales completos.
 */
type Nivel = 'debug' | 'info' | 'warn' | 'error';
const orden: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const CLAVES_SENSIBLES = /contrasena|password|token|secret|authorization/i;

function limpiar(contexto: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(contexto)) {
    salida[k] = CLAVES_SENSIBLES.test(k) ? '[oculto]' : v;
  }
  return salida;
}

function escribir(nivel: Nivel, mensaje: string, contexto: Record<string, unknown> = {}): void {
  if (env.NODE_ENV === 'test' && nivel !== 'error') return;
  if (orden[nivel] < orden[env.LOG_LEVEL]) return;
  const linea = JSON.stringify({ fecha: new Date().toISOString(), nivel, mensaje, ...limpiar(contexto) });
  if (nivel === 'error' || nivel === 'warn') process.stderr.write(linea + '\n');
  else process.stdout.write(linea + '\n');
}

export const logger = {
  debug: (mensaje: string, contexto?: Record<string, unknown>) => escribir('debug', mensaje, contexto),
  info: (mensaje: string, contexto?: Record<string, unknown>) => escribir('info', mensaje, contexto),
  warn: (mensaje: string, contexto?: Record<string, unknown>) => escribir('warn', mensaje, contexto),
  error: (mensaje: string, contexto?: Record<string, unknown>) => escribir('error', mensaje, contexto),
};
