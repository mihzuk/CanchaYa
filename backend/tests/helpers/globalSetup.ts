/**
 * Recrea la base de datos de pruebas y aplica las migraciones antes de correr la suite.
 * Por seguridad, solo actúa sobre bases cuyo nombre termina en "_test".
 */
import pg from 'pg';

const PRUEBAS = {
  NODE_ENV: 'test',
  JWT_SECRET: 'secreto-solo-para-pruebas-de-integracion-0123456789',
  BCRYPT_ROUNDS: '4',
  DATABASE_URL: 'postgres://canchaya:canchaya@localhost:5432/canchaya_test',
  MIGRATIONS_DIR: '../database/migrations',
};

export default async function setup(): Promise<void> {
  for (const [k, v] of Object.entries(PRUEBAS)) process.env[k] ??= v;
  const url = process.env.DATABASE_URL!;
  const nombreBd = new URL(url).pathname.slice(1);
  if (!nombreBd.endsWith('_test')) {
    throw new Error(`Las pruebas solo corren sobre una base *_test (DATABASE_URL apunta a "${nombreBd}").`);
  }

  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await cliente.end();

  const { migrar } = await import('../../src/shared/database/migrate.js');
  const { pool } = await import('../../src/shared/database/pool.js');
  await migrar();
  await pool.end();
}
