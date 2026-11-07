import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import { authRoutes, iniciarModuloAuth, usuariosRoutes } from './modules/auth';
import { venuesRoutes } from './modules/venues';
import { env } from './shared/config/env';
import { pool } from './shared/database/pool';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler';
import { logger } from './shared/logger/logger';

/**
 * Construye la app Express (se separa de main.ts para poder probarla con supertest).
 * Orden: seguridad → parseo → log → rutas de cada módulo → 404 → manejo de errores.
 */
export function createApp(): Express {
  iniciarModuloAuth();

  const app = express();
  app.disable('x-powered-by');
  // Detrás de un proxy (HTTPS terminado en el balanceador) para que req.ip sea la IP real (HT-13).
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  // HT-03: documentación OpenAPI navegable en /api/docs (Swagger UI necesita estilos en línea).
  // src/app.ts (tsx) o dist/src/app.js (compilado): se busca backend/openapi.yaml en ambos casos.
  const rutaOpenapi = [path.resolve(__dirname, '..', 'openapi.yaml'), path.resolve(__dirname, '..', '..', 'openapi.yaml')].find(existsSync);
  const especificacion = rutaOpenapi ? (parseYaml(readFileSync(rutaOpenapi, 'utf8')) as object) : { openapi: '3.0.3', info: { title: 'CanchaYa API', version: '0' }, paths: {} };
  app.get('/api/openapi.json', (_req, res) => {
    res.json(especificacion);
  });
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: { directives: { 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:'] } } }),
    swaggerUi.serve,
    swaggerUi.setup(especificacion, { customSiteTitle: 'CanchaYa API' }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  // HT-14: una línea por petición con fecha, endpoint, estado, duración y usuario.
  app.use((req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('peticion', {
        endpoint: `${req.method} ${req.originalUrl.split('?')[0]}`,
        estado: res.statusCode,
        ms: Number((process.hrtime.bigint() - inicio) / 1_000_000n),
        usuarioId: req.usuario?.id ?? null,
      });
    });
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ estado: 'ok', baseDeDatos: 'ok' });
    } catch {
      res.status(503).json({ estado: 'degradado', baseDeDatos: 'sin conexión' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', usuariosRoutes);
  app.use('/api', venuesRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
