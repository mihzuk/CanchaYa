import type { Request, Response } from 'express';
import { validar, zParamsId } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import {
  actualizarEquipoSchema,
  cederCapitaniaSchema,
  crearEquipoSchema,
  invitacionParamsSchema,
  invitarUsuarioSchema,
  miembroParamsSchema,
  respuestaSchema,
  tokenParamSchema,
} from './teams.dto';
import { teamsService as s } from './teams.service';

const id = (req: Request) => validar(zParamsId, req.params).id;
const yo = (req: Request) => usuarioDe(req).id;

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const teamsController = {
  async crear(req: Request, res: Response) {
    res.status(201).json({ equipo: await s.crear(yo(req), validar(crearEquipoSchema, req.body)) });
  },
  async mios(req: Request, res: Response) {
    res.json({ equipos: await s.misEquipos(yo(req)) });
  },
  async detalle(req: Request, res: Response) {
    res.json(await s.detalle(id(req), req.usuario?.id));
  },
  async actualizar(req: Request, res: Response) {
    res.json({ equipo: await s.actualizar(id(req), yo(req), validar(actualizarEquipoSchema, req.body)) });
  },
  async invitar(req: Request, res: Response) {
    res.status(201).json({ invitacion: await s.invitarUsuario(id(req), yo(req), validar(invitarUsuarioSchema, req.body).username) });
  },
  async crearEnlace(req: Request, res: Response) {
    res.status(201).json(await s.crearEnlace(id(req), yo(req)));
  },
  async invitacionesEquipo(req: Request, res: Response) {
    res.json({ invitaciones: await s.invitacionesDeEquipo(id(req), yo(req)) });
  },
  async revocar(req: Request, res: Response) {
    const p = validar(invitacionParamsSchema, req.params);
    await s.revocarInvitacion(p.id, yo(req), p.invitacionId);
    res.status(204).end();
  },
  async misInvitaciones(req: Request, res: Response) {
    res.json({ invitaciones: await s.misInvitaciones(yo(req)) });
  },
  async responder(req: Request, res: Response) {
    await s.responderInvitacion(id(req), yo(req), validar(respuestaSchema, req.body).aceptar);
    res.status(204).end();
  },
  async vistaEnlace(req: Request, res: Response) {
    res.json(await s.vistaEnlace(validar(tokenParamSchema, req.params).token));
  },
  async unirse(req: Request, res: Response) {
    res.json({ equipo: await s.unirsePorEnlace(validar(tokenParamSchema, req.params).token, yo(req)) });
  },
  async expulsar(req: Request, res: Response) {
    const p = validar(miembroParamsSchema, req.params);
    await s.expulsar(p.id, yo(req), p.usuarioId);
    res.status(204).end();
  },
  async salir(req: Request, res: Response) {
    res.json(await s.salir(id(req), yo(req)));
  },
  async proponerCapitania(req: Request, res: Response) {
    res.json({ equipo: await s.proponerCapitania(id(req), yo(req), validar(cederCapitaniaSchema, req.body).usuarioId) });
  },
  async responderCapitania(req: Request, res: Response) {
    res.json({ equipo: await s.responderCapitania(id(req), yo(req), validar(respuestaSchema, req.body).aceptar) });
  },
};
