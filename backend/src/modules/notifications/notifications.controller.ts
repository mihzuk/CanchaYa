import type { Request, Response } from 'express';
import { validar, zParamsId } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import { listaSchema, preferenciaSchema } from './notifications.dto';
import { notificationsService as s } from './notifications.service';

const id = (req: Request) => validar(zParamsId, req.params).id;
const yo = (req: Request) => usuarioDe(req).id;

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const notificationsController = {
  async listar(req: Request, res: Response) {
    const { pagina, tamano } = validar(listaSchema, req.query);
    res.json(await s.listar(yo(req), pagina, tamano));
  },
  async noLeidas(req: Request, res: Response) {
    res.json({ noLeidas: await s.noLeidas(yo(req)) });
  },
  async marcarLeida(req: Request, res: Response) {
    await s.marcarLeida(id(req), yo(req));
    res.status(204).end();
  },
  async marcarTodas(req: Request, res: Response) {
    await s.marcarTodas(yo(req));
    res.status(204).end();
  },
  async preferencias(req: Request, res: Response) {
    res.json({ preferencias: await s.preferencias(yo(req)) });
  },
  async crearPreferencia(req: Request, res: Response) {
    res.status(201).json({ preferencia: await s.crearPreferencia(yo(req), validar(preferenciaSchema, req.body)) });
  },
  async actualizarPreferencia(req: Request, res: Response) {
    res.json({ preferencia: await s.actualizarPreferencia(id(req), yo(req), validar(preferenciaSchema, req.body)) });
  },
  async eliminarPreferencia(req: Request, res: Response) {
    await s.eliminarPreferencia(id(req), yo(req));
    res.status(204).end();
  },
};
