import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * JWT sin estado de 2 horas (HT-04). Solo lleva el id del usuario (`sub`): el rol y el estado se
 * leen de la base de datos en cada petición, así una suspensión o un cambio de rol aplican de inmediato.
 */
const ALGORITMO = 'HS256' as const;
const EMISOR = 'canchaya-api';
const AUDIENCIA = 'canchaya-web';

export interface TokenFirmado {
  token: string;
  expiraEn: number; // segundos
}

export interface TokenVerificado {
  usuarioId: number;
  /** Momento de emisión (segundos desde epoch). */
  emitidoEn: number;
}

export function firmarToken(usuarioId: number): TokenFirmado {
  const opciones: SignOptions = {
    algorithm: ALGORITMO,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: EMISOR,
    audience: AUDIENCIA,
    subject: String(usuarioId),
  };
  const token = jwt.sign({}, env.JWT_SECRET, opciones);
  const { exp, iat } = jwt.decode(token) as { exp: number; iat: number };
  return { token, expiraEn: exp - iat };
}

/** Devuelve el usuario y la fecha de emisión, o `null` si el token es inválido, expiró o fue alterado. */
export function verificarToken(token: string): TokenVerificado | null {
  try {
    // El algoritmo se fija para impedir ataques de "alg: none" y confusión de algoritmos.
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITMO],
      issuer: EMISOR,
      audience: AUDIENCIA,
    });
    if (typeof payload === 'string' || !payload.sub || !/^\d+$/.test(payload.sub) || typeof payload.iat !== 'number') return null;
    return { usuarioId: Number(payload.sub), emitidoEn: payload.iat };
  } catch {
    return null;
  }
}
