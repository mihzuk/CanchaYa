import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/** RNF-01 / HT-04: contraseñas con hash bcrypt (asíncrono para no bloquear el event loop). */
export function hashContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, env.BCRYPT_ROUNDS);
}

export function verificarContrasena(contrasena: string, hash: string): Promise<boolean> {
  return bcrypt.compare(contrasena, hash);
}

/**
 * Hash ficticio para comparar cuando el correo no existe: el tiempo de respuesta es el mismo y no se
 * puede averiguar qué correos están registrados (enumeración de usuarios).
 */
let hashFicticio: Promise<string> | undefined;
export function hashParaComparacionFicticia(): Promise<string> {
  hashFicticio ??= bcrypt.hash('contrasena-ficticia-que-nunca-coincide-1', env.BCRYPT_ROUNDS);
  return hashFicticio;
}

/** Política de contraseñas de HU-01: mínimo 8 caracteres, al menos una letra y un número. */
export const REGLA_CONTRASENA = {
  min: 8,
  max: 72, // bcrypt solo usa los primeros 72 bytes
  patron: /^(?=.*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])(?=.*\d).+$/,
  mensaje: 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.',
};
