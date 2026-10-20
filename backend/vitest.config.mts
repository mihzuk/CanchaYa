import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Mientras no haya pruebas escritas, la suite no debe fallar.
    passWithNoTests: true,
    // Las pruebas de integración comparten una base de datos: se ejecutan una por una.
    fileParallelism: false,
    // Cuando exista tests/helpers/globalSetup.ts, activar:
    // globalSetup: ['./tests/helpers/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'secreto-solo-para-pruebas-de-integracion-0123456789',
      BCRYPT_ROUNDS: '4',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://canchaya:canchaya@localhost:5432/canchaya_test',
      MIGRATIONS_DIR: '../database/migrations',
    },
  },
});
