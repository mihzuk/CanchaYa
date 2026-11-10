import { api } from '../../lib/api';
import type { Marcador, DetallePartido, FiltrosPartidos, Inscripcion, Partido, Postulacion, PosicionJugador, PublicarInput } from './types';

function qs(params: Record<string, string>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const explorarPartidos = (f: FiltrosPartidos) => api.get<{ partidos: Partido[] }>(`/partidos${qs({ ...f })}`);
export const publicarPartido = (d: PublicarInput) => api.post<{ partido: Partido }>('/partidos', d);
export const obtenerPartido = (id: number) => api.get<DetallePartido>(`/partidos/${id}`);
export const cancelarPartido = (id: number) => api.post<{ partido: Partido }>(`/partidos/${id}/cancelar`);
export const partidosDeEquipo = (equipoId: number) => api.get<{ partidos: Partido[] }>(`/equipos/${equipoId}/partidos`);

export const postularEquipo = (id: number, equipoId: number) =>
  api.post<{ postulacionId: number; confirmado: boolean; partido: Partido }>(`/partidos/${id}/postulaciones`, { equipoId });
export const listarPostulaciones = (id: number) => api.get<{ postulaciones: Postulacion[] }>(`/partidos/${id}/postulaciones`);
export const responderPostulacion = (id: number, aceptar: boolean) => api.post<{ partido: Partido }>(`/postulaciones/${id}/respuesta`, { aceptar });

export const retirarPostulacion = (id: number) => api.delete<void>(`/postulaciones/${id}`);
export const retirarInscripcion = (id: number) => api.delete<void>(`/inscripciones/${id}`);

export const aceptarConReserva = (id: number, d: { equipoId: number; reservaId: number }) =>
  api.post<{ partido: Partido }>(`/partidos/${id}/aceptar-con-reserva`, d);

export const inscribirse = (id: number, posicion: PosicionJugador | null) =>
  api.post<{ inscripcion: Inscripcion }>(`/partidos/${id}/inscripciones`, { posicion });
export const listarInscripciones = (id: number) => api.get<{ inscripciones: Inscripcion[] }>(`/partidos/${id}/inscripciones`);
export const responderInscripcion = (id: number, aceptar: boolean) => api.post<void>(`/inscripciones/${id}/respuesta`, { aceptar });

export const registrarMarcador = (id: number, d: { equipoId: number; golesPublicador: number; golesRival: number }) =>
  api.post<Marcador>(`/partidos/${id}/marcador`, d);
