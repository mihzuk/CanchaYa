import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { logger } from '../logger/logger';
import { detallesDeZod } from '../http/validar';

/**
 * Convierte cualquier error en una respuesta JSON uniforme (HT-03, HT-14):
 * `{ "error": { "codigo", "mensaje", "detalles?", "datos?" } }`.
 * El usuario nunca ve mensajes técnicos; el detalle queda en el log con fecha, endpoint y usuario.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        codigo: err.codigo,
        mensaje: err.message,
        ...(err.detalles ? { detalles: err.detalles } : {}),
        ...(err.datos !== undefined ? { datos: err.datos } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { codigo: 'VALIDACION', mensaje: 'Revisa los datos ingresados.', detalles: detallesDeZod(err) },
    });
    return;
  }

  // Errores de body-parser (JSON mal formado, cuerpo demasiado grande) y de concurrencia de PostgreSQL.
  const e = err as { type?: string; status?: number; code?: string };
  if (e?.code === '40P01' || e?.code === '40001') {
    // Interbloqueo o conflicto de serialización entre transacciones: la operación no se aplicó.
    logger.warn('Conflicto de concurrencia', { endpoint: `${req.method} ${req.originalUrl}`, codigo: e.code });
    res.status(409).json({
      error: { codigo: 'CONFLICTO_CONCURRENTE', mensaje: 'Otra operación modificó estos datos al mismo tiempo. Intenta de nuevo.' },
    });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es un JSON válido.' } });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'La petición es demasiado grande.' } });
    return;
  }

  logger.error('Error no controlado', {
    endpoint: `${req.method} ${req.originalUrl}`,
    usuarioId: req.usuario?.id ?? null,
    error: (err as Error)?.message,
    stack: (err as Error)?.stack,
  });
  res.status(500).json({
    error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.' },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'El recurso solicitado no existe.' } });
}
