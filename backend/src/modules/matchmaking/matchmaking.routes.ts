import { Router } from 'express';
import { authenticate, authenticateOptional } from '../../shared/middleware/authenticate';
import { rateLimiter } from '../../shared/middleware/rateLimiter';
import { matchmakingController as c } from './matchmaking.controller';

/**
 * EP-06 · Busca Equipo / Busca Partido (HU-22 a HU-25). Base: /api
 * Ser capitán del equipo o dueño de la reserva se valida en el servicio.
 */
export const matchmakingRoutes = Router();

const limitePublicar = rateLimiter({ ventanaMs: 60 * 60_000, max: 30, clave: (req) => (req.usuario ? `u${req.usuario.id}` : undefined) });

// HU-22, HU-23 (explorar es público)
matchmakingRoutes.get('/partidos', c.explorar);
matchmakingRoutes.post('/partidos', authenticate, limitePublicar, c.publicar);
matchmakingRoutes.get('/partidos/:id', authenticateOptional, c.detalle);
matchmakingRoutes.post('/partidos/:id/cancelar', authenticate, c.cancelar);
matchmakingRoutes.get('/equipos/:id/partidos', authenticate, c.deEquipo);

// HU-24
matchmakingRoutes.post('/partidos/:id/postulaciones', authenticate, c.postular);
matchmakingRoutes.get('/partidos/:id/postulaciones', authenticate, c.postulaciones);
matchmakingRoutes.post('/postulaciones/:id/respuesta', authenticate, c.responderPostulacion);
matchmakingRoutes.delete('/postulaciones/:id', authenticate, c.retirarPostulacion);

// HU-22.4
matchmakingRoutes.post('/partidos/:id/aceptar-con-reserva', authenticate, c.aceptarConReserva);

// HU-25
matchmakingRoutes.post('/partidos/:id/inscripciones', authenticate, c.inscribirse);
matchmakingRoutes.get('/partidos/:id/inscripciones', authenticate, c.inscripciones);
matchmakingRoutes.post('/inscripciones/:id/respuesta', authenticate, c.responderInscripcion);
matchmakingRoutes.delete('/inscripciones/:id', authenticate, c.retirarInscripcion);
