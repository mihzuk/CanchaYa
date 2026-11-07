import pg from 'pg';
import { env } from '../config/env';

// Tipos de PostgreSQL -> JavaScript:
// - DATE se deja como 'YYYY-MM-DD' (fecha de calendario, sin zona horaria).
// - TIMESTAMP sin zona (hora local de Bogotá) se deja como texto 'YYYY-MM-DD HH:MM:SS'.
// - NUMERIC y BIGINT se convierten a number (pesos COP con 2 decimales e ids muy por debajo de 2^53).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => v);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/** Cualquier objeto que pueda ejecutar consultas: el pool o un cliente dentro de una transacción. */
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

/** Ejecuta una consulta parametrizada y devuelve las filas tipadas. */
export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  db: Queryable = pool,
): Promise<T[]> {
  const res = await db.query<T>(sql, params as unknown[]);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  db: Queryable = pool,
): Promise<T | undefined> {
  const filas = await query<T>(sql, params, db);
  return filas[0];
}

/**
 * Ejecuta `fn` dentro de una transacción (HT-05). Si `fn` lanza un error se hace ROLLBACK.
 * El nivel por defecto es READ COMMITTED; las reglas de no cruce se garantizan con restricciones
 * de exclusión y bloqueos `FOR UPDATE` dentro de `fn`.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Códigos de error de PostgreSQL que se traducen a errores de negocio. */
export const PG_ERRORES = {
  UNIQUE: '23505',
  FOREIGN_KEY: '23503',
  CHECK: '23514',
  EXCLUSION: '23P01',
} as const;

export function esErrorPg(err: unknown, codigo: string, restriccion?: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; constraint?: string };
  return e.code === codigo && (restriccion === undefined || e.constraint === restriccion);
}
