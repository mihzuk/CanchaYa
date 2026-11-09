import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { authorize } from '../../shared/middleware/authorize';
import { rateLimiter } from '../../shared/middleware/rateLimiter';
import { bookingsController as c } from './bookings.controller';

/**
 * EP-03 · Reservas (HU-10 a HU-14, HT-05). Base: /api
 * Que el usuario sea dueño de la reserva o administre su complejo se valida en el servicio.
 */
export const bookingsRoutes = Router();

const gestor = [authenticate, authorize('AdminComplejo', 'Superadmin')];
// Evita que un usuario acapare franjas creando reservas en ráfaga.
const limiteReservas = rateLimiter({ ventanaMs: 60_000, max: 10, clave: (req) => (req.usuario ? `u${req.usuario.id}` : undefined) });

// HU-10 (públicas: un visitante puede consultar disponibilidad)
bookingsRoutes.get('/disponibilidad', c.buscar);
bookingsRoutes.get('/complejos/:id/disponibilidad', c.disponibilidadComplejo);

// HU-11, HU-13
bookingsRoutes.post('/reservas', authenticate, limiteReservas, c.crear);
bookingsRoutes.get('/mis-reservas', authenticate, c.mias);
bookingsRoutes.get('/reservas/:id', authenticate, c.obtener);

// HU-14
bookingsRoutes.get('/complejos/:id/reservas', ...gestor, c.calendario);
bookingsRoutes.post('/complejos/:id/reservas-manuales', ...gestor, c.manual);
bookingsRoutes.patch('/reservas/:id/estado', ...gestor, c.cambiarEstado);
