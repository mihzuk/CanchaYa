import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { authorize } from '../../shared/middleware/authorize';
import { rateLimiter } from '../../shared/middleware/rateLimiter';
import { paymentsController as c } from './payments.controller';

/**
 * EP-04 · Pagos y cancelaciones (HU-12, HU-16 a HU-18, HT-08). Base: /api
 * Quién es dueño de la reserva o administra el complejo se valida en el servicio.
 */
export const paymentsRoutes = Router();

const gestor = [authenticate, authorize('AdminComplejo', 'Superadmin')];
// Limita los reintentos de pago (y las pruebas de tarjetas por fuerza bruta).
const limitePagos = rateLimiter({ ventanaMs: 10 * 60_000, max: 10, clave: (req) => (req.usuario ? `u${req.usuario.id}` : undefined) });

// HU-16 (jugador) y HU-17 (administrador del complejo)
paymentsRoutes.post('/reservas/:id/pagos/abono', authenticate, limitePagos, c.pagarAbono);
paymentsRoutes.post('/reservas/:id/pagos', ...gestor, c.pagoManual);
paymentsRoutes.get('/reservas/:id/pagos', authenticate, c.pagosDeReserva);

// HU-12
paymentsRoutes.get('/reservas/:id/cancelacion', authenticate, c.previewCancelacion);
paymentsRoutes.post('/reservas/:id/cancelar', authenticate, c.cancelar);
paymentsRoutes.post('/reservas/:id/reprogramar', authenticate, c.reprogramar);

// HU-17.2 y HU-18
paymentsRoutes.get('/complejos/:id/pagos', ...gestor, c.pagosDeComplejo);
paymentsRoutes.get('/complejos/:id/reembolsos', ...gestor, c.reembolsosDeComplejo);
paymentsRoutes.patch('/reembolsos/:id', ...gestor, c.resolverReembolso);
