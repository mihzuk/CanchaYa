import { z, type ZodError, type ZodTypeAny } from 'zod';
import { AppError, type DetalleError } from '../errors/AppError';
import { esFechaValida, esHoraValida, normalizarHora } from '../utils/time';

/** Traduce los errores de zod a `detalles` por campo. */
export function detallesDeZod(err: ZodError): DetalleError[] {
  return err.issues.map((i) => ({ campo: i.path.join('.') || 'cuerpo', mensaje: i.message }));
}

/** Valida una entrada (body, query o params) con un esquema zod; lanza 400 VALIDACION si no cumple. */
export function validar<S extends ZodTypeAny>(esquema: S, datos: unknown): z.infer<S> {
  const r = esquema.safeParse(datos);
  if (!r.success) throw AppError.validacion(detallesDeZod(r.error));
  return r.data;
}

// --- Esquemas reutilizables ---------------------------------------------------------------

export const zId = z.coerce
  .number({ invalid_type_error: 'Debe ser un número' })
  .int('Debe ser un número entero')
  .positive('Debe ser un número positivo')
  .max(Number.MAX_SAFE_INTEGER);

export const zParamsId = z.object({ id: zId });

export const zFecha = z
  .string({ required_error: 'La fecha es obligatoria' })
  .refine(esFechaValida, 'Usa el formato AAAA-MM-DD');

export const zHora = z
  .string({ required_error: 'La hora es obligatoria' })
  .refine(esHoraValida, 'Usa el formato HH:MM')
  .transform(normalizarHora);

/** Texto recortado; vacío se trata como ausente. */
export const zTexto = (max: number, nombre = 'El campo') =>
  z
    .string()
    .trim()
    .min(1, `${nombre} es obligatorio`)
    .max(max, `${nombre} admite máximo ${max} caracteres`);

export const zTextoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** Solo URL https (fotos, escudos): evita esquemas como javascript: o data:. */
export const zUrlHttps = z
  .string()
  .trim()
  .max(255, 'La URL admite máximo 255 caracteres')
  .url('Debe ser una URL válida')
  .refine((u) => u.startsWith('https://'), 'La URL debe empezar por https://');

export const zCelular = z
  .string()
  .trim()
  .regex(/^\+?\d{7,15}$/, 'El celular debe tener entre 7 y 15 dígitos');

export const zTipoFutbol = z.coerce
  .number()
  .refine((n) => [5, 6, 7, 8, 11].includes(n), 'El tipo de fútbol debe ser 5, 6, 7, 8 u 11');

export const zDinero = z.coerce
  .number({ invalid_type_error: 'Debe ser un valor numérico' })
  .int('El valor debe ser en pesos, sin decimales')
  .positive('El valor debe ser mayor que cero')
  .max(100_000_000, 'El valor es demasiado alto');

export const zBooleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
