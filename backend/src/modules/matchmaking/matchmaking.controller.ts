import type { Request, Response } from 'express';
import { validar, zParamsId } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import { aceptarConReservaSchema, filtrosPartidosSchema, inscribirSchema, postularSchema, publicarSchema, respuestaSchema } from './matchmaking.dto';
import { matchmakingService as s } from './matchmaking.service';

const id = (req: Request) => validar(zParamsId, req.params).id;

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const matchmakingController = {
  async publicar(req: Request, res: Response) {
    res.status(201).json({ partido: await s.publicar(usuarioDe(req), validar(publicarSchema, req.body)) });
  },
  async explorar(req: Request, res: Response) {
    res.json({ partidos: await s.explorar(validar(filtrosPartidosSchema, req.query)) });
  },
  async detalle(req: Request, res: Response) {
    res.json(await s.detalle(id(req), req.usuario));
  },
  async deEquipo(req: Request, res: Response) {
    res.json({ partidos: await s.partidosDeEquipo(id(req), usuarioDe(req)) });
  },
  async cancelar(req: Request, res: Response) {
    res.json({ partido: await s.cancelar(id(req), usuarioDe(req)) });
  },
  async postular(req: Request, res: Response) {
    res.status(201).json(await s.postular(id(req), usuarioDe(req), validar(postularSchema, req.body).equipoId));
  },
  async postulaciones(req: Request, res: Response) {
    res.json({ postulaciones: await s.postulaciones(id(req), usuarioDe(req)) });
  },
  async responderPostulacion(req: Request, res: Response) {
    res.json({ partido: await s.responderPostulacion(id(req), usuarioDe(req), validar(respuestaSchema, req.body).aceptar) });
  },
  async retirarPostulacion(req: Request, res: Response) {
    await s.retirarPostulacion(id(req), usuarioDe(req));
    res.status(204).end();
  },
  async aceptarConReserva(req: Request, res: Response) {
    const d = validar(aceptarConReservaSchema, req.body);
    res.json({ partido: await s.aceptarConReserva(id(req), usuarioDe(req), d.equipoId, d.reservaId) });
  },
  async inscribirse(req: Request, res: Response) {
    res.status(201).json({ inscripcion: await s.inscribirse(id(req), usuarioDe(req), validar(inscribirSchema, req.body).posicion) });
  },
  async inscripciones(req: Request, res: Response) {
    res.json({ inscripciones: await s.inscripciones(id(req), usuarioDe(req)) });
  },
  async responderInscripcion(req: Request, res: Response) {
    res.json({ partido: await s.responderInscripcion(id(req), usuarioDe(req), validar(respuestaSchema, req.body).aceptar) });
  },
  async retirarInscripcion(req: Request, res: Response) {
    await s.retirarInscripcion(id(req), usuarioDe(req));
    res.status(204).end();
  },
};
