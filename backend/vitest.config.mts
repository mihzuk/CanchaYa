import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Las pruebas de integración comparten una base de datos: se ejecutan una por una.
    fileParallelism: false,
    // Recrea la base *_test y aplica las migraciones antes de la suite.
    globalSetup: ['./tests/helpers/globalSetup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/__tests__/**'],
      reporter: ['text-summary', 'html'],
    },
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'secreto-solo-para-pruebas-de-integracion-0123456789',
      BCRYPT_ROUNDS: '4',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://canchaya:canchaya@localhost:5432/canchaya_test',
      MIGRATIONS_DIR: '../database/migrations',
    },
  },
});
