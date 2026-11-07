import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env, esProduccion } from '../config/env';
import { logger } from '../logger/logger';
import { pool } from './pool';

/** Carga los datos de prueba de database/seeds (solo desarrollo; nunca en producción). */
export async function sembrar(directorio = path.resolve(process.cwd(), env.SEEDS_DIR)): Promise<void> {
  if (esProduccion) throw new Error('El seed no se ejecuta en producción.');
  const archivos = (await readdir(directorio)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    for (const archivo of archivos) {
      const sql = await readFile(path.join(directorio, archivo), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        logger.info('Seed aplicado', { archivo });
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falló el seed ${archivo}: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
}

if (require.main === module) {
  sembrar()
    .catch((err: Error) => {
      logger.error('Error en el seed', { error: err.message });
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
