import type { Request, Response } from 'express';
import { validar, zParamsId } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import { calificarComplejoSchema, calificarEquipoSchema, paginaSchema } from './ratings.dto';
import { ratingsService as s } from './ratings.service';

const id = (req: Request) => validar(zParamsId, req.params).id;

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const ratingsController = {
  async calificarComplejo(req: Request, res: Response) {
    const d = validar(calificarComplejoSchema, req.body);
    res.json({ calificacion: await s.calificarComplejo(id(req), usuarioDe(req), d.estrellas, d.comentario) });
  },
  async miCalificacion(req: Request, res: Response) {
    res.json({ calificacion: await s.miCalificacion(id(req), usuarioDe(req)) });
  },
  async deComplejo(req: Request, res: Response) {
    const p = validar(paginaSchema, req.query);
    res.json(await s.deComplejo(id(req), p.pagina, p.tamano));
  },
  async calificarEquipo(req: Request, res: Response) {
    res.status(201).json({ calificacion: await s.calificarEquipo(id(req), usuarioDe(req), validar(calificarEquipoSchema, req.body)) });
  },
  async miCalificacionDePartido(req: Request, res: Response) {
    res.json({ calificacion: await s.miCalificacionDePartido(id(req), usuarioDe(req)) });
  },
  async porConfirmar(req: Request, res: Response) {
    res.json({ reportes: await s.inasistenciasPorConfirmar(id(req), usuarioDe(req)) });
  },
  async confirmar(req: Request, res: Response) {
    res.json({ calificacion: await s.confirmarInasistencia(id(req), usuarioDe(req)) });
  },
};
