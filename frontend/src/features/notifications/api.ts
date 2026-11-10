import { api } from '../../lib/api';
import type { PaginaNotificaciones, PreferenciaAlerta, PreferenciaAlertaInput } from './types';

export const listarNotificaciones = (pagina = 1, tamano = 20) => api.get<PaginaNotificaciones>(`/notificaciones?pagina=${pagina}&tamano=${tamano}`);
export const contarNoLeidas = () => api.get<{ noLeidas: number }>('/notificaciones/no-leidas');
export const marcarLeida = (id: number) => api.patch<void>(`/notificaciones/${id}/leida`);
export const marcarTodasLeidas = () => api.post<void>('/notificaciones/leidas');

export const listarPreferencias = () => api.get<{ preferencias: PreferenciaAlerta[] }>('/preferencias-alerta');
export const crearPreferencia = (d: PreferenciaAlertaInput) => api.post<{ preferencia: PreferenciaAlerta }>('/preferencias-alerta', d);
export const actualizarPreferencia = (id: number, d: PreferenciaAlertaInput) => api.put<{ preferencia: PreferenciaAlerta }>(`/preferencias-alerta/${id}`, d);
export const eliminarPreferencia = (id: number) => api.delete<void>(`/preferencias-alerta/${id}`);
