import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { authorize } from '../../shared/middleware/authorize';
import { ratingsController as c } from './ratings.controller';

/** EP-08 · Calificaciones y reputación (HU-30, HU-31). Base: /api */
export const ratingsRoutes = Router();

const gestor = [authenticate, authorize('AdminComplejo', 'Superadmin')];

ratingsRoutes.put('/reservas/:id/calificacion', authenticate, c.calificarComplejo);
ratingsRoutes.get('/reservas/:id/calificacion', authenticate, c.miCalificacion);
ratingsRoutes.get('/complejos/:id/calificaciones', c.deComplejo);
ratingsRoutes.post('/partidos/:id/calificaciones', authenticate, c.calificarEquipo);
ratingsRoutes.get('/partidos/:id/mi-calificacion', authenticate, c.miCalificacionDePartido);
ratingsRoutes.get('/complejos/:id/inasistencias-reportadas', ...gestor, c.porConfirmar);
ratingsRoutes.post('/calificaciones-equipo/:id/confirmar-inasistencia', ...gestor, c.confirmar);
