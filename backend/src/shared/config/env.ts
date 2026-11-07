import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Fuera de Docker (que inyecta las variables con env_file) se carga el .env del backend o de la raíz.
// Las variables ya definidas en el entorno tienen prioridad: loadEnvFile no las sobrescribe.
if (process.env.NODE_ENV !== 'test') {
  for (const archivo of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '.env')]) {
    if (existsSync(archivo)) {
      process.loadEnvFile(archivo);
      break;
    }
  }
}

/**
 * Lee y valida las variables de entorno una sola vez al arrancar.
 * Si falta algo obligatorio o es inseguro, el proceso no arranca (falla rápido).
 */
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  MIGRATIONS_DIR: z.string().default('../database/migrations'),
  SEEDS_DIR: z.string().default('../database/seeds'),
  // Correo (HT-07). Sin SMTP_HOST los correos se escriben en el log (desarrollo) o en memoria (pruebas).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('CanchaYa <no-responder@canchaya.local>'),
  // Pagos (HT-08): "simulado" hasta integrar una pasarela real.
  PAYMENT_PROVIDER: z.enum(['simulado']).default('simulado'),
  // Tareas programadas (HT-06). Se desactivan en pruebas.
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof esquema>;

function cargar(): Env {
  const resultado = esquema.safeParse(process.env);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${problemas}`);
  }
  const env = resultado.data;
  if (env.NODE_ENV === 'production' && /cambia-esto/.test(env.JWT_SECRET)) {
    throw new Error('JWT_SECRET de ejemplo en producción: configura un secreto propio.');
  }
  if (env.NODE_ENV === 'production' && !env.SMTP_HOST) {
    throw new Error('SMTP_HOST es obligatorio en producción: sin él los enlaces de los correos irían al log.');
  }
  return env;
}

export const env: Env = cargar();
export const esProduccion = env.NODE_ENV === 'production';
export const esPrueba = env.NODE_ENV === 'test';
