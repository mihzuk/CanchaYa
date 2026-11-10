import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { notificationsController as c } from './notifications.controller';

/** EP-07 · Notificaciones (HU-28, HU-29, HT-07). Base: /api. Cada usuario solo accede a lo suyo. */
export const notificationsRoutes = Router();

notificationsRoutes.use(['/notificaciones', '/preferencias-alerta'], authenticate);
notificationsRoutes.get('/notificaciones', c.listar);
notificationsRoutes.get('/notificaciones/no-leidas', c.noLeidas);
notificationsRoutes.post('/notificaciones/leidas', c.marcarTodas);
notificationsRoutes.patch('/notificaciones/:id/leida', c.marcarLeida);
notificationsRoutes.get('/preferencias-alerta', c.preferencias);
notificationsRoutes.post('/preferencias-alerta', c.crearPreferencia);
notificationsRoutes.put('/preferencias-alerta/:id', c.actualizarPreferencia);
notificationsRoutes.delete('/preferencias-alerta/:id', c.eliminarPreferencia);
