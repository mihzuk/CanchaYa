import type { Request, Response } from 'express';
import { z } from 'zod';
import { validar, zId, zParamsId } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import {
  aprobacionSchema,
  bloqueoSchema,
  canchaSchema,
  complejoSchema,
  fechaParamSchema,
  filtrosComplejosSchema,
  fotoSchema,
  franjasQuerySchema,
  horarioEspecialSchema,
  horarioHabitualSchema,
  rangoFechasSchema,
  serviciosSchema,
  tarifaSchema,
} from './venues.dto';
import { venuesService as s } from './venues.service';

const id = (req: Request) => validar(zParamsId, req.params).id;
const fotoParams = z.object({ id: zId, fotoId: zId });

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const venuesController = {
  async servicios(_req: Request, res: Response) {
    res.json({ servicios: await s.listarServicios() });
  },

  async buscar(req: Request, res: Response) {
    res.json(await s.buscarComplejos(validar(filtrosComplejosSchema, req.query)));
  },

  async misComplejos(req: Request, res: Response) {
    res.json({ complejos: await s.misComplejos(usuarioDe(req)) });
  },

  async pendientes(_req: Request, res: Response) {
    res.json({ complejos: await s.complejosPendientes() });
  },

  async detalle(req: Request, res: Response) {
    res.json(await s.detalleComplejo(id(req), req.usuario));
  },

  async crear(req: Request, res: Response) {
    res.status(201).json({ complejo: await s.crearComplejo(usuarioDe(req), validar(complejoSchema, req.body)) });
  },

  async actualizar(req: Request, res: Response) {
    res.json({ complejo: await s.actualizarComplejo(id(req), usuarioDe(req), validar(complejoSchema, req.body)) });
  },

  async aprobacion(req: Request, res: Response) {
    const { aprobar, motivo } = validar(aprobacionSchema, req.body);
    res.json({ complejo: await s.resolverAprobacion(id(req), usuarioDe(req), aprobar, motivo) });
  },

  async servicioscomplejo(req: Request, res: Response) {
    const { servicioIds } = validar(serviciosSchema, req.body);
    res.json({ complejo: await s.reemplazarServicios(id(req), usuarioDe(req), servicioIds) });
  },

  async agregarFoto(req: Request, res: Response) {
    res.status(201).json({ foto: await s.agregarFoto(id(req), usuarioDe(req), validar(fotoSchema, req.body).url) });
  },

  async eliminarFoto(req: Request, res: Response) {
    const p = validar(fotoParams, req.params);
    await s.eliminarFoto(p.id, usuarioDe(req), p.fotoId);
    res.status(204).end();
  },

  async crearCancha(req: Request, res: Response) {
    res.status(201).json({ cancha: await s.crearCancha(id(req), usuarioDe(req), validar(canchaSchema, req.body)) });
  },

  async actualizarCancha(req: Request, res: Response) {
    res.json({ cancha: await s.actualizarCancha(id(req), usuarioDe(req), validar(canchaSchema, req.body)) });
  },

  async horarios(req: Request, res: Response) {
    res.json({ horarios: await s.listarHorarios(id(req), usuarioDe(req)) });
  },

  async guardarHorarioHabitual(req: Request, res: Response) {
    res.json(await s.guardarHorarioHabitual(id(req), usuarioDe(req), validar(horarioHabitualSchema, req.body).dias));
  },

  async guardarHorarioEspecial(req: Request, res: Response) {
    res.json(await s.guardarHorarioEspecial(id(req), usuarioDe(req), validar(horarioEspecialSchema, req.body)));
  },

  async eliminarHorarioEspecial(req: Request, res: Response) {
    const p = validar(fechaParamSchema, req.params);
    await s.eliminarHorarioEspecial(p.id, usuarioDe(req), p.fecha);
    res.status(204).end();
  },

  async tarifas(req: Request, res: Response) {
    res.json({ tarifas: await s.listarTarifas(id(req), req.usuario) });
  },

  async crearTarifa(req: Request, res: Response) {
    res.status(201).json({ tarifa: await s.crearTarifa(id(req), usuarioDe(req), validar(tarifaSchema, req.body)) });
  },

  async actualizarTarifa(req: Request, res: Response) {
    res.json({ tarifa: await s.actualizarTarifa(id(req), usuarioDe(req), validar(tarifaSchema, req.body)) });
  },

  async eliminarTarifa(req: Request, res: Response) {
    await s.eliminarTarifa(id(req), usuarioDe(req));
    res.status(204).end();
  },

  async bloqueos(req: Request, res: Response) {
    const r = validar(rangoFechasSchema, req.query);
    res.json({ bloqueos: await s.listarBloqueos(id(req), usuarioDe(req), r.desde, r.hasta) });
  },

  async crearBloqueo(req: Request, res: Response) {
    res.status(201).json({ bloqueo: await s.crearBloqueo(id(req), usuarioDe(req), validar(bloqueoSchema, req.body)) });
  },

  async eliminarBloqueo(req: Request, res: Response) {
    await s.eliminarBloqueo(id(req), usuarioDe(req));
    res.status(204).end();
  },

  async franjas(req: Request, res: Response) {
    const { fecha } = validar(franjasQuerySchema, req.query);
    res.json(await s.franjasDeCancha(id(req), fecha, req.usuario));
  },
};
