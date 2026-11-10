import { api } from '../../lib/api';
import type { CalificacionEquipoInput, CalificacionReserva, PaginaResenas, ReporteInasistencia } from './types';

export const calificarReserva = (reservaId: number, d: { estrellas: number; comentario?: string }) =>
  api.put<{ calificacion: CalificacionReserva }>(`/reservas/${reservaId}/calificacion`, d);
export const miCalificacionDeReserva = (reservaId: number) => api.get<{ calificacion: CalificacionReserva | null }>(`/reservas/${reservaId}/calificacion`);
export const calificacionesDeComplejo = (complejoId: number, pagina = 1, tamano = 10) =>
  api.get<PaginaResenas>(`/complejos/${complejoId}/calificaciones?pagina=${pagina}&tamano=${tamano}`);

export const calificarEquipoRival = (partidoId: number, d: CalificacionEquipoInput) => api.post<unknown>(`/partidos/${partidoId}/calificaciones`, d);
export const miCalificacionDePartido = (partidoId: number) => api.get<{ calificacion: { id: number; noSePresento: boolean } | null }>(`/partidos/${partidoId}/mi-calificacion`);
export const inasistenciasReportadas = (complejoId: number) => api.get<{ reportes: ReporteInasistencia[] }>(`/complejos/${complejoId}/inasistencias-reportadas`);
export const confirmarInasistencia = (id: number) => api.post<unknown>(`/calificaciones-equipo/${id}/confirmar-inasistencia`);
