import { api } from '../../lib/api';
import type {
  Bloqueo,
  BloqueoInput,
  Cancha,
  CanchaInput,
  Complejo,
  ComplejoInput,
  ComplejoResumen,
  DetalleComplejo,
  DiaHorario,
  FiltrosComplejos,
  Foto,
  Franja,
  HorarioEspecialInput,
  PaginaComplejos,
  ResultadoHorarios,
  Servicio,
  Tarifa,
  TarifaInput,
} from './types';

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const listarServicios = () => api.get<{ servicios: Servicio[] }>('/servicios');
export const buscarComplejos = (f: FiltrosComplejos) => api.get<PaginaComplejos>(`/complejos${qs({ ...f })}`);
export const obtenerComplejo = (id: number) => api.get<DetalleComplejo>(`/complejos/${id}`);
export const misComplejos = () => api.get<{ complejos: ComplejoResumen[] }>('/mis-complejos');
export const crearComplejo = (d: ComplejoInput) => api.post<{ complejo: Complejo }>('/complejos', d);
export const actualizarComplejo = (id: number, d: ComplejoInput) => api.put<{ complejo: Complejo }>(`/complejos/${id}`, d);
export const reemplazarServicios = (id: number, servicioIds: number[]) =>
  api.put<{ complejo: Complejo }>(`/complejos/${id}/servicios`, { servicioIds });
export const agregarFoto = (id: number, url: string) => api.post<{ foto: Foto }>(`/complejos/${id}/fotos`, { url });
export const eliminarFoto = (id: number, fotoId: number) => api.delete<void>(`/complejos/${id}/fotos/${fotoId}`);

export const crearCancha = (complejoId: number, d: CanchaInput) =>
  api.post<{ cancha: Cancha }>(`/complejos/${complejoId}/canchas`, d);
export const actualizarCancha = (id: number, d: CanchaInput) => api.put<{ cancha: Cancha }>(`/canchas/${id}`, d);

export const guardarHorarios = (id: number, dias: DiaHorario[]) =>
  api.put<ResultadoHorarios>(`/complejos/${id}/horarios`, { dias });
export const guardarHorarioEspecial = (id: number, d: HorarioEspecialInput) =>
  api.post<ResultadoHorarios>(`/complejos/${id}/horarios-especiales`, d);
export const eliminarHorarioEspecial = (id: number, fecha: string) =>
  api.delete<void>(`/complejos/${id}/horarios-especiales/${fecha}`);

export const listarTarifas = (canchaId: number) => api.get<{ tarifas: Tarifa[] }>(`/canchas/${canchaId}/tarifas`);
export const crearTarifa = (canchaId: number, d: TarifaInput) =>
  api.post<{ tarifa: Tarifa }>(`/canchas/${canchaId}/tarifas`, d);
export const actualizarTarifa = (id: number, d: TarifaInput) => api.put<{ tarifa: Tarifa }>(`/tarifas/${id}`, d);
export const eliminarTarifa = (id: number) => api.delete<void>(`/tarifas/${id}`);

export const listarBloqueos = (canchaId: number) => api.get<{ bloqueos: Bloqueo[] }>(`/canchas/${canchaId}/bloqueos`);
export const crearBloqueo = (canchaId: number, d: BloqueoInput) =>
  api.post<{ bloqueo: Bloqueo }>(`/canchas/${canchaId}/bloqueos`, d);
export const eliminarBloqueo = (id: number) => api.delete<void>(`/bloqueos/${id}`);

export const obtenerFranjas = (canchaId: number, fecha: string) =>
  api.get<{ cancha: Cancha; franjas: Franja[] }>(`/canchas/${canchaId}/franjas${qs({ fecha })}`);
