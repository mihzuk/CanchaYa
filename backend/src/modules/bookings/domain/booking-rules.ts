import { diferenciaDias, horaAMinutos, partesBogota } from '../../../shared/utils/time';
import { porcentajeDe } from '../../../shared/utils/money';

/** Estados de reserva y cuáles ocupan la franja (RN-01). */
export type EstadoReserva = 'pendiente_pago' | 'confirmada' | 'pagada' | 'cancelada' | 'expirada' | 'completada' | 'no_asistio';
export const ESTADOS_ACTIVOS: readonly EstadoReserva[] = ['pendiente_pago', 'confirmada', 'pagada'];

export function estaActiva(estado: EstadoReserva): boolean {
  return ESTADOS_ACTIVOS.includes(estado);
}

export type MotivoNoReservable =
  | 'FECHA_PASADA'
  | 'FUERA_DE_ANTICIPACION'
  | 'FUERA_DE_HORARIO'
  | 'FRANJA_BLOQUEADA'
  | 'SIN_TARIFA';

export const MENSAJES_NO_RESERVABLE: Record<MotivoNoReservable, string> = {
  FECHA_PASADA: 'Esa franja ya empezó o está en el pasado.',
  FUERA_DE_ANTICIPACION: 'Solo se puede reservar con hasta {dias} días de anticipación.',
  FUERA_DE_HORARIO: 'Esa franja no está dentro del horario de atención de la cancha.',
  FRANJA_BLOQUEADA: 'La cancha está bloqueada en ese horario.',
  SIN_TARIFA: 'Esa franja no tiene tarifa definida; no se puede reservar.',
};

/**
 * RN-06: una franja es reservable si es una de las franjas del horario de ese día, empieza en el futuro,
 * está dentro de los días de anticipación permitidos, no está bloqueada y tiene tarifa.
 *
 * @param franjasDelDia franjas generadas por el horario (HU-07)
 * @param ahora instante actual (se convierte a hora de Bogotá)
 */
export function validarReservable(params: {
  fecha: string;
  horaInicio: string;
  franjasDelDia: readonly { horaInicio: string; horaFin: string }[];
  precio: number | null;
  bloqueada: boolean;
  diasAnticipacionMax: number;
  ahora: Date;
}): { ok: true; horaFin: string; precio: number } | { ok: false; motivo: MotivoNoReservable } {
  const { fecha, horaInicio, franjasDelDia, precio, bloqueada, diasAnticipacionMax, ahora } = params;
  const local = partesBogota(ahora);
  if (fecha < local.fecha || (fecha === local.fecha && horaAMinutos(horaInicio) <= local.minutos)) {
    return { ok: false, motivo: 'FECHA_PASADA' };
  }
  if (diferenciaDias(local.fecha, fecha) > diasAnticipacionMax) return { ok: false, motivo: 'FUERA_DE_ANTICIPACION' };
  const franja = franjasDelDia.find((f) => f.horaInicio === horaInicio);
  if (!franja) return { ok: false, motivo: 'FUERA_DE_HORARIO' };
  if (bloqueada) return { ok: false, motivo: 'FRANJA_BLOQUEADA' };
  if (precio === null) return { ok: false, motivo: 'SIN_TARIFA' };
  return { ok: true, horaFin: franja.horaFin, precio };
}

/**
 * RN-03 y RN-04: el precio queda fijo al reservar y el abono es el porcentaje del complejo
 * (50 % por defecto). El saldo inicial es el valor total.
 */
export function calcularValores(precio: number, porcentajeAbono: number): { precioTotal: number; abonoRequerido: number; saldoPendiente: number } {
  return { precioTotal: precio, abonoRequerido: porcentajeDe(precio, porcentajeAbono), saldoPendiente: precio };
}

/** Horas que faltan desde `ahora` hasta el inicio de la reserva (negativo si ya empezó). */
export function horasDeAnticipacion(inicio: Date, ahora: Date): number {
  return (inicio.getTime() - ahora.getTime()) / 3_600_000;
}
