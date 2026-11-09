import { api } from '../../lib/api';
import type { ComplejoPendiente } from './types';

export const listarPendientes = () => api.get<{ complejos: ComplejoPendiente[] }>('/complejos/pendientes');
export const resolverAprobacion = (id: number, aprobar: boolean, motivo?: string) =>
  api.patch<{ complejo: ComplejoPendiente }>(`/complejos/${id}/aprobacion`, motivo ? { aprobar, motivo } : { aprobar });
