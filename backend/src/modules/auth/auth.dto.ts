import { z } from 'zod';
import { zCelular, zFecha, zTexto, zUrlHttps } from '../../shared/http/validar';
import type { Rol } from '../../shared/middleware/authenticate';
import { REGLA_CONTRASENA } from '../../shared/security/password';
import { hoyBogota } from '../../shared/utils/time';

export const POSICIONES = ['arquero', 'defensa', 'medio', 'delantero'] as const;
export const NIVELES = ['principiante', 'intermedio', 'avanzado'] as const;
export type Posicion = (typeof POSICIONES)[number];
export type Nivel = (typeof NIVELES)[number];

const zCorreo = z
  .string({ required_error: 'El correo es obligatorio' })
  .trim()
  .toLowerCase()
  .max(150, 'El correo admite máximo 150 caracteres')
  .email('Ingresa un correo válido');

const zContrasena = z
  .string({ required_error: 'La contraseña es obligatoria' })
  .min(REGLA_CONTRASENA.min, REGLA_CONTRASENA.mensaje)
  .max(REGLA_CONTRASENA.max, 'La contraseña admite máximo 72 caracteres')
  .regex(REGLA_CONTRASENA.patron, REGLA_CONTRASENA.mensaje);

const zUsername = z
  .string({ required_error: 'El nombre de usuario es obligatorio' })
  .trim()
  .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
  .max(30, 'El nombre de usuario admite máximo 30 caracteres')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Usa solo letras, números, punto y guion bajo');

const zFechaNacimiento = zFecha.refine((f) => f < hoyBogota() && f >= '1900-01-01', 'Ingresa una fecha de nacimiento válida');

// HU-01
export const registroSchema = z.object({
  nombres: zTexto(80, 'El nombre'),
  apellidos: zTexto(80, 'El apellido'),
  username: zUsername,
  correo: zCorreo,
  celular: zCelular,
  fechaNacimiento: zFechaNacimiento,
  contrasena: zContrasena,
  // RNF-03: Ley 1581 de 2012
  aceptaTratamientoDatos: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar los términos y el tratamiento de datos personales' }),
  }),
});
export type RegistroDto = z.infer<typeof registroSchema>;

// HU-02 (no se valida la política de contraseña al ingresar: solo que exista)
export const loginSchema = z.object({
  correo: zCorreo,
  contrasena: z.string({ required_error: 'La contraseña es obligatoria' }).min(1, 'La contraseña es obligatoria').max(200),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const tokenSchema = z.object({ token: z.string().min(10, 'El enlace no es válido').max(200) });

// HU-03
export const recuperarSchema = z.object({ correo: zCorreo });
export const restablecerSchema = z.object({ token: z.string().min(10).max(200), contrasena: zContrasena });

export const cambiarContrasenaSchema = z.object({
  actual: z.string().min(1, 'Ingresa tu contraseña actual').max(200),
  nueva: zContrasena,
});

// HU-04
export const perfilSchema = z.object({
  nombres: zTexto(80, 'El nombre'),
  apellidos: zTexto(80, 'El apellido'),
  celular: zCelular,
  // PUT reemplaza el perfil: un campo opcional omitido queda vacío (null).
  fotoUrl: zUrlHttps.nullable().default(null),
  posicionPreferida: z.enum(POSICIONES, { errorMap: () => ({ message: 'Elige una posición válida' }) }).nullable().default(null),
  nivel: z.enum(NIVELES, { errorMap: () => ({ message: 'Elige un nivel válido' }) }).nullable().default(null),
});
export type PerfilDto = z.infer<typeof perfilSchema>;

export const usernameParamSchema = z.object({ username: zUsername });

// --- Salida ---------------------------------------------------------------------------------

export interface UsuarioDto {
  id: number;
  username: string;
  correo: string;
  nombres: string;
  apellidos: string;
  celular: string;
  fechaNacimiento: string;
  fotoUrl: string | null;
  posicionPreferida: Posicion | null;
  nivel: Nivel | null;
  rol: Rol;
  correoVerificado: boolean;
  fechaRegistro: string;
}

/** HU-04: el perfil público nunca expone correo ni celular. */
export interface PerfilPublicoDto {
  username: string;
  nombres: string;
  apellidos: string;
  fotoUrl: string | null;
  posicionPreferida: Posicion | null;
  nivel: Nivel | null;
  fechaRegistro: string;
  partidosJugados: number;
  fairPlay: number | null;
  equipos: { id: number; nombre: string; escudoUrl: string | null }[];
}

export interface SesionDto {
  token: string;
  expiraEn: number;
  usuario: UsuarioDto;
}
