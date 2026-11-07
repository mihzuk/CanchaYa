import { Router, type Request } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { rateLimiter } from '../../shared/middleware/rateLimiter';
import { authController as c } from './auth.controller';

/** EP-01 · Usuarios y autenticación (HU-01 a HU-04, HT-04). Base: /api/auth */
const correoDelBody = (req: Request) =>
  typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase().slice(0, 150) : undefined;

// HT-13: límite de peticiones por minuto en el inicio de sesión (además del bloqueo de cuenta de HU-02).
const limiteLogin = rateLimiter({ ventanaMs: 60_000, max: 10, clave: correoDelBody });
// Solo por IP: frena el "password spraying" (pocos intentos contra muchas cuentas).
const limiteLoginPorIp = rateLimiter({ ventanaMs: 15 * 60_000, max: 50 });
const limiteRegistro = rateLimiter({ ventanaMs: 60 * 60_000, max: 20 });
const limiteCorreos = rateLimiter({ ventanaMs: 15 * 60_000, max: 5, clave: correoDelBody });
// Acciones de un usuario autenticado: el conteo es por usuario, no solo por IP.
const porUsuario = (req: Request) => (req.usuario ? `u${req.usuario.id}` : undefined);
const limiteCuenta = rateLimiter({ ventanaMs: 15 * 60_000, max: 5, clave: porUsuario });

export const authRoutes = Router();

authRoutes.post('/registro', limiteRegistro, c.registro);
authRoutes.post('/login', limiteLoginPorIp, limiteLogin, c.login);
authRoutes.post('/logout', c.logout);
authRoutes.post('/verificar-correo', limiteLogin, c.verificarCorreo);
authRoutes.post('/reenviar-verificacion', authenticate, limiteCuenta, c.reenviarVerificacion);
authRoutes.post('/recuperar-contrasena', limiteCorreos, c.recuperar);
authRoutes.post('/restablecer-contrasena', limiteLogin, c.restablecer);
authRoutes.get('/yo', authenticate, c.yo);
authRoutes.put('/yo', authenticate, c.actualizarPerfil);
authRoutes.put('/yo/contrasena', authenticate, limiteCuenta, c.cambiarContrasena);

/** Perfil público (HU-04). Base: /api/usuarios */
export const usuariosRoutes = Router();
usuariosRoutes.get('/:username', c.perfilPublico);
