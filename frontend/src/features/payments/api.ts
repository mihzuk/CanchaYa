import { api } from '../../lib/api';
import type { PagoComplejo, PagoEnLineaInput, PagoManualInput, PagoRespuesta, Reembolso, ReembolsoComplejo, ResumenPagoDividido, RetiroRival } from './types';

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const pagarAbono = (reservaId: number, d: PagoEnLineaInput) => api.post<PagoRespuesta>(`/reservas/${reservaId}/pagos/abono`, d);
export const registrarPagoManual = (reservaId: number, d: PagoManualInput) => api.post<PagoRespuesta>(`/reservas/${reservaId}/pagos`, d);
export const pagosDeComplejo = (complejoId: number, desde?: string, hasta?: string) =>
  api.get<{ pagos: PagoComplejo[] }>(`/complejos/${complejoId}/pagos${qs({ desde, hasta })}`);
export const reembolsosDeComplejo = (complejoId: number, estado: 'pendiente' | 'reembolsado') =>
  api.get<{ reembolsos: ReembolsoComplejo[] }>(`/complejos/${complejoId}/reembolsos${qs({ estado })}`);
export const resolverReembolso = (id: number) => api.patch<{ reembolso: Reembolso }>(`/reembolsos/${id}`, {});

export const resumenPagoPartido = (partidoId: number) => api.get<ResumenPagoDividido>(`/partidos/${partidoId}/resumen-pago`);
export const pagarComoRival = (partidoId: number, d: PagoEnLineaInput) => api.post<unknown>(`/partidos/${partidoId}/pago-rival`, d);
export const retirarRival = (partidoId: number) => api.post<RetiroRival>(`/partidos/${partidoId}/retirar-rival`);
