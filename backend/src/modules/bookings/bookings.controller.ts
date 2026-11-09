import type { Request, Response } from 'express';
import { validar, zParamsId } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import {
  busquedaSchema,
  cambioEstadoSchema,
  crearReservaSchema,
  fechaQuerySchema,
  misReservasSchema,
  reservaManualSchema,
} from './bookings.dto';
import { bookingsService as s } from './bookings.service';

const id = (req: Request) => validar(zParamsId, req.params).id;

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const bookingsController = {
  async buscar(req: Request, res: Response) {
    res.json(await s.buscarDisponibilidad(validar(busquedaSchema, req.query)));
  },

  async disponibilidadComplejo(req: Request, res: Response) {
    res.json(await s.disponibilidadDeComplejo(id(req), validar(fechaQuerySchema, req.query).fecha));
  },

  async crear(req: Request, res: Response) {
    res.status(201).json({ reserva: await s.crearReserva(usuarioDe(req), validar(crearReservaSchema, req.body)) });
  },

  async obtener(req: Request, res: Response) {
    res.json({ reserva: await s.obtenerReserva(id(req), usuarioDe(req)) });
  },

  async mias(req: Request, res: Response) {
    res.json({ reservas: await s.misReservas(usuarioDe(req), validar(misReservasSchema, req.query).vista) });
  },

  async calendario(req: Request, res: Response) {
    res.json(await s.calendarioDeComplejo(id(req), usuarioDe(req), validar(fechaQuerySchema, req.query).fecha));
  },

  async manual(req: Request, res: Response) {
    res.status(201).json({ reserva: await s.crearReservaManual(id(req), usuarioDe(req), validar(reservaManualSchema, req.body)) });
  },

  async cambiarEstado(req: Request, res: Response) {
    res.json({ reserva: await s.cambiarEstado(id(req), usuarioDe(req), validar(cambioEstadoSchema, req.body).estado) });
  },
};
