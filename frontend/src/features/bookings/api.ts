import { api } from '../../lib/api';
import type {
  CalendarioComplejo,
  DisponibilidadComplejo,
  EstadoReserva,
  FiltrosDisponibilidad,
  PrevisualizacionCancelacion,
  RespuestaBusqueda,
  Reserva,
  ReservaManualInput,
} from './types';

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const buscarDisponibilidad = (f: FiltrosDisponibilidad) => api.get<RespuestaBusqueda>(`/disponibilidad${qs({ ...f })}`);
export const disponibilidadComplejo = (complejoId: number, fecha: string) =>
  api.get<DisponibilidadComplejo>(`/complejos/${complejoId}/disponibilidad${qs({ fecha })}`);

export const crearReserva = (d: { canchaId: number; fecha: string; horaInicio: string }) => api.post<{ reserva: Reserva }>('/reservas', d);
export const obtenerReserva = (id: number) => api.get<{ reserva: Reserva }>(`/reservas/${id}`);
export const misReservas = (vista: 'proximas' | 'historial') => api.get<{ reservas: Reserva[] }>(`/mis-reservas${qs({ vista })}`);

export const calendarioComplejo = (complejoId: number, fecha: string) =>
  api.get<CalendarioComplejo>(`/complejos/${complejoId}/reservas${qs({ fecha })}`);
export const crearReservaManual = (complejoId: number, d: ReservaManualInput) =>
  api.post<{ reserva: Reserva }>(`/complejos/${complejoId}/reservas-manuales`, d);
export const cambiarEstadoReserva = (id: number, estado: Extract<EstadoReserva, 'completada' | 'no_asistio'>) =>
  api.patch<{ reserva: Reserva }>(`/reservas/${id}/estado`, { estado });

export const previsualizarCancelacion = (id: number) => api.get<PrevisualizacionCancelacion>(`/reservas/${id}/cancelacion`);
export const cancelarReserva = (id: number, motivo?: string) =>
  api.post<{ reserva: Reserva; porcentajeReembolso: number; valorReembolso: number }>(`/reservas/${id}/cancelar`, motivo ? { motivo } : {});
export const reprogramarReserva = (id: number, d: { fecha: string; horaInicio: string; canchaId: number }) =>
  api.post<{ reserva: Reserva; excedenteReembolsado: number }>(`/reservas/${id}/reprogramar`, d);
