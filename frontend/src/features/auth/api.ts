import { api } from '../../lib/api';
import type {
  PerfilDatos,
  PerfilPublico,
  RegistroDatos,
  SesionRespuesta,
  Usuario,
} from './types';

export const registrar = (datos: RegistroDatos) =>
  api.post<SesionRespuesta>('/auth/registro', datos);

export const login = (correo: string, contrasena: string) =>
  api.post<SesionRespuesta>('/auth/login', { correo, contrasena });

export const logout = () => api.post<void>('/auth/logout');

export const obtenerYo = () => api.get<{ usuario: Usuario }>('/auth/yo');

export const actualizarPerfil = (datos: PerfilDatos) =>
  api.put<{ usuario: Usuario }>('/auth/yo', datos);

export const cambiarContrasena = (actual: string, nueva: string) =>
  api.put<{ token: string; expiraEn: number }>('/auth/yo/contrasena', { actual, nueva });

export const verificarCorreo = (token: string) =>
  api.post<void>('/auth/verificar-correo', { token });

export const reenviarVerificacion = () => api.post<void>('/auth/reenviar-verificacion');

export const recuperarContrasena = (correo: string) =>
  api.post<{ mensaje: string }>('/auth/recuperar-contrasena', { correo });

export const restablecerContrasena = (token: string, contrasena: string) =>
  api.post<void>('/auth/restablecer-contrasena', { token, contrasena });

export const obtenerPerfilPublico = (username: string) =>
  api.get<{ perfil: PerfilPublico }>(`/usuarios/${encodeURIComponent(username)}`);
