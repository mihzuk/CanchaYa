import type { Request, Response } from 'express';
import { validar } from '../../shared/http/validar';
import { usuarioDe } from '../../shared/middleware/authenticate';
import {
  cambiarContrasenaSchema,
  loginSchema,
  perfilSchema,
  recuperarSchema,
  registroSchema,
  restablecerSchema,
  tokenSchema,
  usernameParamSchema,
} from './auth.dto';
import { authService } from './auth.service';

/** Valida la entrada y delega en el servicio. No accede a la base de datos. */
export const authController = {
  async registro(req: Request, res: Response) {
    res.status(201).json(await authService.registrar(validar(registroSchema, req.body)));
  },

  async login(req: Request, res: Response) {
    res.json(await authService.iniciarSesion(validar(loginSchema, req.body)));
  },

  /** JWT sin estado: cerrar sesión es descartar el token en el cliente. */
  async logout(_req: Request, res: Response) {
    res.status(204).end();
  },

  async yo(req: Request, res: Response) {
    res.json({ usuario: await authService.obtenerUsuario(usuarioDe(req).id) });
  },

  async actualizarPerfil(req: Request, res: Response) {
    res.json({ usuario: await authService.actualizarPerfil(usuarioDe(req).id, validar(perfilSchema, req.body)) });
  },

  async cambiarContrasena(req: Request, res: Response) {
    const { actual, nueva } = validar(cambiarContrasenaSchema, req.body);
    // Las demás sesiones quedan cerradas; esta recibe un token nuevo.
    res.json(await authService.cambiarContrasena(usuarioDe(req).id, actual, nueva));
  },

  async verificarCorreo(req: Request, res: Response) {
    await authService.verificarCorreo(validar(tokenSchema, req.body).token);
    res.status(204).end();
  },

  async reenviarVerificacion(req: Request, res: Response) {
    await authService.reenviarVerificacion(usuarioDe(req).id);
    res.status(204).end();
  },

  async recuperar(req: Request, res: Response) {
    res.status(202).json(await authService.solicitarRecuperacion(validar(recuperarSchema, req.body).correo));
  },

  async restablecer(req: Request, res: Response) {
    const { token, contrasena } = validar(restablecerSchema, req.body);
    await authService.restablecerContrasena(token, contrasena);
    res.status(204).end();
  },

  async perfilPublico(req: Request, res: Response) {
    const { username } = validar(usernameParamSchema, req.params);
    res.json({ perfil: await authService.perfilPublico(username) });
  },
};
