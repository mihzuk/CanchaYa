import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verificarToken } from '../security/jwt';

export type Rol = 'Jugador' | 'AdminComplejo' | 'Superadmin';

/** Usuario de la sesión actual, disponible como `req.usuario` después de `authenticate`. */
export interface UsuarioSesion {
  id: number;
  rol: Rol;
  estado: 'activo' | 'suspendido' | 'desactivado';
  correoVerificado: boolean;
  nombres: string;
  /** Tokens emitidos antes de esta fecha ya no valen (cambio o restablecimiento de contraseña). */
  credencialesDesde: Date;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioSesion;
  }
}

type ResolverUsuario = (id: number) => Promise<UsuarioSesion | undefined>;
let resolver: ResolverUsuario | undefined;

/**
 * El módulo auth registra cómo cargar el usuario (shared/ no puede importar módulos).
 * Se carga en cada petición para que una suspensión o un cambio de rol apliquen de inmediato.
 */
export function configurarResolverUsuario(fn: ResolverUsuario): void {
  resolver = fn;
}

function extraerToken(req: Request): string | undefined {
  const cabecera = req.headers.authorization;
  if (!cabecera) return undefined;
  const [tipo, token] = cabecera.split(' ');
  return tipo?.toLowerCase() === 'bearer' && token ? token : undefined;
}

async function resolverSesion(req: Request): Promise<UsuarioSesion | undefined> {
  const token = extraerToken(req);
  if (!token) return undefined;
  const verificado = verificarToken(token);
  const expirada = () => new AppError(401, 'TOKEN_INVALIDO', 'Tu sesión expiró. Inicia sesión de nuevo.');
  if (verificado === null) throw expirada();
  if (!resolver) throw new Error('Resolver de usuario no configurado');
  const usuario = await resolver(verificado.usuarioId);
  if (!usuario) throw expirada();
  // Comparación en segundos (resolución del `iat` del JWT).
  if (verificado.emitidoEn < Math.floor(usuario.credencialesDesde.getTime() / 1000)) throw expirada();
  if (usuario.estado !== 'activo') {
    throw new AppError(403, 'CUENTA_INACTIVA', 'Tu cuenta está suspendida o desactivada. Contacta al soporte.');
  }
  return usuario;
}

/** Exige un JWT válido (HT-04). */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const usuario = await resolverSesion(req);
  if (!usuario) throw AppError.noAutenticado();
  req.usuario = usuario;
  next();
}

/** Igual que `authenticate`, pero deja pasar a los visitantes sin token (rutas públicas con extras). */
export async function authenticateOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const usuario = await resolverSesion(req).catch(() => undefined);
  if (usuario) req.usuario = usuario;
  next();
}

/** Devuelve el usuario autenticado o lanza 401 (para usar en controladores). */
export function usuarioDe(req: Request): UsuarioSesion {
  if (!req.usuario) throw AppError.noAutenticado();
  return req.usuario;
}
