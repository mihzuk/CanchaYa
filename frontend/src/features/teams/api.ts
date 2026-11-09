import { api } from '../../lib/api';
import type { CrearEquipoInput, DetalleEquipo, Equipo, EnlaceEquipo, Invitacion, NivelEquipo, VistaEnlace } from './types';

export const crearEquipo = (d: CrearEquipoInput) => api.post<{ equipo: Equipo }>('/equipos', d);
export const misEquipos = () => api.get<{ equipos: Equipo[] }>('/mis-equipos');
export const obtenerEquipo = (id: number) => api.get<DetalleEquipo>(`/equipos/${id}`);
export const actualizarEquipo = (id: number, d: { escudoUrl: string | null; nivel: NivelEquipo }) =>
  api.put<{ equipo: Equipo }>(`/equipos/${id}`, d);

export const invitarUsuario = (id: number, username: string) => api.post<{ invitacion: Invitacion }>(`/equipos/${id}/invitaciones`, { username });
export const generarEnlace = (id: number) => api.post<EnlaceEquipo>(`/equipos/${id}/enlaces`);
export const invitacionesDeEquipo = (id: number) => api.get<{ invitaciones: Invitacion[] }>(`/equipos/${id}/invitaciones`);
export const revocarInvitacion = (id: number, invitacionId: number) => api.delete<void>(`/equipos/${id}/invitaciones/${invitacionId}`);
export const misInvitaciones = () => api.get<{ invitaciones: Invitacion[] }>('/mis-invitaciones');
export const responderInvitacion = (id: number, aceptar: boolean) => api.post<void>(`/invitaciones/${id}/respuesta`, { aceptar });
export const vistaEnlace = (token: string) => api.get<VistaEnlace>(`/enlaces-equipo/${encodeURIComponent(token)}`);
export const unirseConEnlace = (token: string) => api.post<{ equipo: Equipo }>(`/enlaces-equipo/${encodeURIComponent(token)}/unirse`);

export const expulsarMiembro = (id: number, usuarioId: number) => api.delete<void>(`/equipos/${id}/miembros/${usuarioId}`);
export const salirDelEquipo = (id: number) => api.post<{ equipoInactivo: boolean }>(`/equipos/${id}/salir`);
export const proponerCapitania = (id: number, usuarioId: number) => api.post<{ equipo: Equipo }>(`/equipos/${id}/capitania`, { usuarioId });
export const responderCapitania = (id: number, aceptar: boolean) => api.post<{ equipo: Equipo }>(`/equipos/${id}/capitania/respuesta`, { aceptar });
