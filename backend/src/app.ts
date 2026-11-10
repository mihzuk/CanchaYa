import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import { iniciarModuloNotificaciones, notificationsRoutes, registrarDirectorioNotificaciones } from './modules/notifications';
import { iniciarModuloRatings, ratingsApi, ratingsRoutes } from './modules/ratings';
import { authApi, authRoutes, iniciarModuloAuth, registrarContribuyentePerfil, usuariosRoutes } from './modules/auth';
import { bookingsApi, bookingsRoutes, iniciarModuloBookings, registrarResolverNombres } from './modules/bookings';
import { iniciarModuloMatchmaking, matchmakingRoutes, registrarDirectorioJugadores } from './modules/matchmaking';
import { paymentsRoutes } from './modules/payments';
import { registrarDirectorioUsuarios, teamsApi, teamsRoutes } from './modules/teams';
import { registrarConsultaCalificaciones, venuesRoutes } from './modules/venues';
import { env } from './shared/config/env';
import { pool } from './shared/database/pool';
import { endpointParaLog } from './shared/http/validar';
import { AppError } from './shared/errors/AppError';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler';
import { logger } from './shared/logger/logger';

/**
 * Construye la app Express (se separa de main.ts para poder probarla con supertest).
 * Orden: seguridad → parseo → log → rutas de cada módulo → 404 → manejo de errores.
 */
let perfilConectado = false;

export function createApp(): Express {
  iniciarModuloAuth();
  iniciarModuloBookings();
  // Composición: bookings muestra al administrador el nombre de los jugadores sin depender de auth.
  registrarResolverNombres((ids) => authApi.nombresDeUsuarios(ids));
  iniciarModuloMatchmaking();
  iniciarModuloRatings();
  iniciarModuloNotificaciones();
  registrarConsultaCalificaciones((ids) => ratingsApi.promediosDeComplejos(ids));
  // Composición: notifications no importa a nadie; aquí se le dice cómo consultar lo que necesita.
  registrarDirectorioNotificaciones({
    contactos: authApi.contactos,
    capitanes: teamsApi.capitanes,
    nombresEquipos: async (ids) => new Map((await teamsApi.porIds(ids)).map((e) => [e.id, e.nombre])),
    reserva: async (id) => {
      const r = await bookingsApi.obtener(id);
      return r && { codigo: r.codigo, usuarioId: r.usuarioId, adminId: r.adminId, complejo: r.complejo.nombre, fecha: r.fecha, hora: r.horaInicio };
    },
  });
  if (!perfilConectado) {
    perfilConectado = true;
    // HU-04.2: partidos jugados, equipos y fair play (promedio de los equipos del jugador).
    registrarContribuyentePerfil(async (id) => {
      const equipos = await teamsApi.equiposDeUsuario(id);
      const notas = [...(await ratingsApi.fairPlayDeEquipos(equipos.map((e) => e.id))).values()];
      return {
        equipos,
        partidosJugados: await bookingsApi.contarCompletadas(id),
        fairPlay: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null,
      };
    });
  }
  // Composición: teams y matchmaking leen datos públicos de usuarios sin depender de auth.
  registrarDirectorioUsuarios({ porUsername: authApi.usuarioPublicoPorUsername, porIds: authApi.usuariosPublicos });
  registrarDirectorioJugadores(authApi.usuariosPublicos);

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
  // PostgreSQL no admite el carácter NUL en un texto: se rechaza aquí con un 400 claro.
  app.use((req, _res, next) => {
    if (JSON.stringify(req.body ?? '').includes('\\u0000') || req.originalUrl.includes('%00')) {
      throw new AppError(400, 'CARACTER_INVALIDO', 'La petición contiene caracteres no permitidos.');
    }
    next();
  });

  // HT-14: una línea por petición con fecha, endpoint, estado, duración y usuario.
  app.use((req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('peticion', {
        endpoint: endpointParaLog(req),
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
  app.use('/api', bookingsRoutes);
  app.use('/api', paymentsRoutes);
  app.use('/api', teamsRoutes);
  app.use('/api', matchmakingRoutes);
  app.use('/api', ratingsRoutes);
  app.use('/api', notificationsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
