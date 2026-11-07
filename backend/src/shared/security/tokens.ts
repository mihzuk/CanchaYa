import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * Tokens aleatorios para enlaces de correo (verificación HU-01, recuperación HU-03) e invitaciones.
 * El token en claro solo viaja en el enlace; en la base de datos se guarda su SHA-256, así una fuga
 * de la tabla no permite usar los enlaces.
 */
export function generarToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para dictarlo por teléfono

/** Código legible de reserva (HU-11), p. ej. "CY-7KQ2M9XA". */
export function generarCodigoReserva(): string {
  let codigo = '';
  for (let i = 0; i < 8; i++) codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return `CY-${codigo}`;
}
