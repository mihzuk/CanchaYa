import type { Reserva } from '../bookings/types';

export type MetodoPago = 'tarjeta' | 'pse' | 'nequi' | 'efectivo' | 'transferencia';
export type MetodoEnLinea = 'tarjeta' | 'pse' | 'nequi';
export type TipoPago = 'abono' | 'saldo' | 'aporte_jugador';
export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'reembolsado';

export interface Pago {
  id: number;
  reservaId: number;
  usuarioId: number | null;
  equipoId: number | null;
  valor: number;
  tipo: TipoPago;
  metodo: MetodoPago;
  referencia: string | null;
  estado: EstadoPago;
  fecha: string;
}
export interface Reembolso {
  id: number;
  pagoId: number;
  reservaId: number;
  valor: number;
  porcentaje: number;
  motivo: string;
  estado: 'pendiente' | 'reembolsado';
  fechaSolicitud: string;
  fechaResolucion: string | null;
}
export interface ReservaResumen {
  codigo: string;
  fecha: string;
  horaInicio: string;
  cancha: string | { nombre: string };
  cliente: string | null;
}
export type PagoComplejo = Pago & { reserva: ReservaResumen; reembolsado: number; reembolsoPendiente: number };
export type ReembolsoComplejo = Reembolso & { reserva: ReservaResumen };

export interface PagoEnLineaInput {
  metodo: MetodoEnLinea;
  valor?: number;
  datos?: { numeroTarjeta?: string; resultado?: 'aprobado' | 'rechazado' };
}
export interface PagoManualInput {
  tipo: 'abono' | 'saldo';
  metodo: 'efectivo' | 'transferencia';
  valor?: number;
  referencia?: string;
}
export interface PagoRespuesta {
  pago: Pago;
  reserva: Reserva;
}

export function nombreCancha(r: ReservaResumen): string {
  return typeof r.cancha === 'string' ? r.cancha : r.cancha.nombre;
}
