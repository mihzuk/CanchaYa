import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import type { Rol } from './authenticate';

/**
 * Exige que el usuario autenticado tenga uno de los roles indicados (RNF-02, HT-04).
 * Se usa después de `authenticate`. La propiedad del recurso (p. ej. "es mi complejo") se valida en el servicio.
 */
export function authorize(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario) throw AppError.noAutenticado();
    if (!roles.includes(req.usuario.rol)) throw AppError.prohibido();
    next();
  };
}
