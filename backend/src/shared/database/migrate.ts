import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../logger/logger';
import { pool } from './pool';

/**
 * Aplica en orden los archivos .sql de database/migrations que aún no se han ejecutado (HT-02).
 * Cada archivo corre en su propia transacción; los aplicados quedan en la tabla schema_migraciones.
 * Un bloqueo consultivo evita que dos instancias migren al mismo tiempo.
 */
export async function migrar(directorio = path.resolve(process.cwd(), env.MIGRATIONS_DIR)): Promise<string[]> {
  const client = await pool.connect();
  const aplicadas: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migraciones (
        nombre      VARCHAR(255) PRIMARY KEY,
        aplicada_en TIMESTAMPTZ  NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ nombre: string }>('SELECT nombre FROM schema_migraciones');
    const yaAplicadas = new Set(rows.map((r) => r.nombre));
    const archivos = (await readdir(directorio)).filter((f) => f.endsWith('.sql')).sort();

    for (const archivo of archivos) {
      if (yaAplicadas.has(archivo)) continue;
      const sql = await readFile(path.join(directorio, archivo), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migraciones (nombre) VALUES ($1)', [archivo]);
        await client.query('COMMIT');
        aplicadas.push(archivo);
        logger.info('Migración aplicada', { archivo });
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${archivo}: ${(err as Error).message}`);
      }
    }
    return aplicadas;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
}

if (require.main === module) {
  migrar()
    .then((aplicadas) => {
      logger.info(aplicadas.length ? 'Migraciones completas' : 'La base de datos ya estaba al día', {
        aplicadas: aplicadas.length,
      });
    })
    .catch((err: Error) => {
      logger.error('Error al migrar', { error: err.message });
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
