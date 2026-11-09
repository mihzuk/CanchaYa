import { Router } from 'express';
import { authenticate, authenticateOptional } from '../../shared/middleware/authenticate';
import { rateLimiter } from '../../shared/middleware/rateLimiter';
import { teamsController as c } from './teams.controller';

/**
 * EP-05 · Equipos (HU-19 a HU-21). Base: /api
 * Ser capitán o miembro se valida en el servicio: cualquier usuario puede crear equipos.
 */
export const teamsRoutes = Router();

const porUsuario = (req: { usuario?: { id: number } }) => (req.usuario ? `u${req.usuario.id}` : undefined);
const limiteInvitaciones = rateLimiter({ ventanaMs: 60 * 60_000, max: 30, clave: porUsuario });
// Los enlaces se prueban por IP: dificulta adivinar tokens.
const limiteEnlaces = rateLimiter({ ventanaMs: 60_000, max: 20 });

teamsRoutes.post('/equipos', authenticate, c.crear);
teamsRoutes.get('/mis-equipos', authenticate, c.mios);
teamsRoutes.get('/equipos/:id', authenticateOptional, c.detalle);
teamsRoutes.put('/equipos/:id', authenticate, c.actualizar);

// HU-20
teamsRoutes.post('/equipos/:id/invitaciones', authenticate, limiteInvitaciones, c.invitar);
teamsRoutes.post('/equipos/:id/enlaces', authenticate, limiteInvitaciones, c.crearEnlace);
teamsRoutes.get('/equipos/:id/invitaciones', authenticate, c.invitacionesEquipo);
teamsRoutes.delete('/equipos/:id/invitaciones/:invitacionId', authenticate, c.revocar);
teamsRoutes.get('/mis-invitaciones', authenticate, c.misInvitaciones);
teamsRoutes.post('/invitaciones/:id/respuesta', authenticate, c.responder);
teamsRoutes.get('/enlaces-equipo/:token', limiteEnlaces, c.vistaEnlace);
teamsRoutes.post('/enlaces-equipo/:token/unirse', authenticate, limiteEnlaces, c.unirse);

// HU-21
teamsRoutes.delete('/equipos/:id/miembros/:usuarioId', authenticate, c.expulsar);
teamsRoutes.post('/equipos/:id/salir', authenticate, c.salir);
teamsRoutes.post('/equipos/:id/capitania', authenticate, c.proponerCapitania);
teamsRoutes.post('/equipos/:id/capitania/respuesta', authenticate, c.responderCapitania);
