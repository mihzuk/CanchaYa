import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

/**
 * Límite de peticiones por ventana fija (HT-13), en memoria.
 * Se usa en el inicio de sesión y en los endpoints que envían correos. Con varias instancias del backend
 * cada una lleva su propio conteo: suficiente como defensa adicional al bloqueo de cuenta de HU-02.
 */
interface Opciones {
  ventanaMs: number;
  max: number;
  /** Clave adicional además de la IP (p. ej. el correo del body). */
  clave?: (req: Request) => string | undefined;
  mensaje?: string;
}

interface Contador {
  cantidad: number;
  reinicia: number;
}

const limitadores: Map<string, Contador>[] = [];

export function rateLimiter({ ventanaMs, max, clave, mensaje }: Opciones) {
  const contadores = new Map<string, Contador>();
  limitadores.push(contadores);

  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [k, c] of contadores) if (c.reinicia <= ahora) contadores.delete(k);
  }, ventanaMs);
  limpieza.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const extra = clave?.(req);
    const k = `${req.ip ?? 'desconocida'}|${extra ?? ''}`;
    const ahora = Date.now();
    let c = contadores.get(k);
    if (!c || c.reinicia <= ahora) {
      c = { cantidad: 0, reinicia: ahora + ventanaMs };
      contadores.set(k, c);
    }
    c.cantidad++;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - c.cantidad)));
    if (c.cantidad > max) {
      res.setHeader('Retry-After', String(Math.ceil((c.reinicia - ahora) / 1000)));
      throw new AppError(429, 'DEMASIADAS_PETICIONES', mensaje ?? 'Hiciste demasiados intentos. Espera un momento e intenta de nuevo.');
    }
    next();
  };
}

/** Solo para pruebas: reinicia todos los contadores. */
export function reiniciarLimitadores(): void {
  for (const m of limitadores) m.clear();
}
