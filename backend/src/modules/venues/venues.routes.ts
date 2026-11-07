import { Router } from 'express';
import { authenticate, authenticateOptional } from '../../shared/middleware/authenticate';
import { authorize } from '../../shared/middleware/authorize';
import { rateLimiter } from '../../shared/middleware/rateLimiter';
import { venuesController as c } from './venues.controller';

/**
 * EP-02 · Complejos, canchas y horarios (HU-05 a HU-09). Base: /api
 * Las rutas de gestión exigen sesión; que el usuario sea el dueño del complejo se valida en el servicio.
 */
export const venuesRoutes = Router();

const gestor = [authenticate, authorize('AdminComplejo', 'Superadmin')];
// Evita llenar la cola de aprobación con registros masivos.
const limiteRegistroComplejo = rateLimiter({
  ventanaMs: 60 * 60_000,
  max: 5,
  clave: (req) => (req.usuario ? `u${req.usuario.id}` : undefined),
});

// Públicas (visitantes): catálogo, búsqueda, detalle, tarifas y franjas.
venuesRoutes.get('/servicios', c.servicios);
venuesRoutes.get('/complejos', c.buscar);
// Cualquier usuario con sesión: un Jugador sin complejos recibe una lista vacía.
venuesRoutes.get('/mis-complejos', authenticate, c.misComplejos);
venuesRoutes.get('/complejos/pendientes', authenticate, authorize('Superadmin'), c.pendientes);
venuesRoutes.get('/complejos/:id', authenticateOptional, c.detalle);
venuesRoutes.get('/canchas/:id/tarifas', authenticateOptional, c.tarifas);
venuesRoutes.get('/canchas/:id/franjas', authenticateOptional, c.franjas);

// HU-05: cualquier usuario registrado puede registrar su complejo (pasa a AdminComplejo).
venuesRoutes.post('/complejos', authenticate, limiteRegistroComplejo, c.crear);
venuesRoutes.put('/complejos/:id', ...gestor, c.actualizar);
venuesRoutes.put('/complejos/:id/servicios', ...gestor, c.servicioscomplejo);
venuesRoutes.post('/complejos/:id/fotos', ...gestor, c.agregarFoto);
venuesRoutes.delete('/complejos/:id/fotos/:fotoId', ...gestor, c.eliminarFoto);
venuesRoutes.patch('/complejos/:id/aprobacion', authenticate, authorize('Superadmin'), c.aprobacion);

// HU-06
venuesRoutes.post('/complejos/:id/canchas', ...gestor, c.crearCancha);
venuesRoutes.put('/canchas/:id', ...gestor, c.actualizarCancha);

// HU-07
venuesRoutes.get('/complejos/:id/horarios', ...gestor, c.horarios);
venuesRoutes.put('/complejos/:id/horarios', ...gestor, c.guardarHorarioHabitual);
venuesRoutes.post('/complejos/:id/horarios-especiales', ...gestor, c.guardarHorarioEspecial);
venuesRoutes.delete('/complejos/:id/horarios-especiales/:fecha', ...gestor, c.eliminarHorarioEspecial);

// HU-08
venuesRoutes.post('/canchas/:id/tarifas', ...gestor, c.crearTarifa);
venuesRoutes.put('/tarifas/:id', ...gestor, c.actualizarTarifa);
venuesRoutes.delete('/tarifas/:id', ...gestor, c.eliminarTarifa);

// HU-09
venuesRoutes.get('/canchas/:id/bloqueos', ...gestor, c.bloqueos);
venuesRoutes.post('/canchas/:id/bloqueos', ...gestor, c.crearBloqueo);
venuesRoutes.delete('/bloqueos/:id', ...gestor, c.eliminarBloqueo);
