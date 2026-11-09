import { describe, expect, it } from 'vitest';
import { calcularValores, estaActiva, horasDeAnticipacion, validarReservable } from '../domain/booking-rules';
import { instanteBogota } from '../../../shared/utils/time';

const franjas = [
  { horaInicio: '08:00', horaFin: '09:00' },
  { horaInicio: '09:00', horaFin: '10:00' },
];
// "Ahora": 2026-11-10 07:30 en Bogotá.
const ahora = instanteBogota('2026-11-10', '07:30');
const base = { fecha: '2026-11-10', horaInicio: '08:00', franjasDelDia: franjas, precio: 80000, bloqueada: false, diasAnticipacionMax: 30, ahora };

describe('validarReservable (RN-06)', () => {
  it('acepta una franja del horario, futura, sin bloqueo y con tarifa', () => {
    expect(validarReservable(base)).toEqual({ ok: true, horaFin: '09:00', precio: 80000 });
  });

  it('rechaza franjas que ya empezaron o pasaron', () => {
    expect(validarReservable({ ...base, ahora: instanteBogota('2026-11-10', '08:00') })).toEqual({ ok: false, motivo: 'FECHA_PASADA' });
    expect(validarReservable({ ...base, fecha: '2026-11-09' })).toEqual({ ok: false, motivo: 'FECHA_PASADA' });
  });

  it('permite hasta 30 días de anticipación y no más', () => {
    expect(validarReservable({ ...base, fecha: '2026-12-10' }).ok).toBe(true);
    expect(validarReservable({ ...base, fecha: '2026-12-11' })).toEqual({ ok: false, motivo: 'FUERA_DE_ANTICIPACION' });
  });

  it('solo franjas exactas del horario de atención', () => {
    expect(validarReservable({ ...base, horaInicio: '08:30' })).toEqual({ ok: false, motivo: 'FUERA_DE_HORARIO' });
    expect(validarReservable({ ...base, horaInicio: '10:00' })).toEqual({ ok: false, motivo: 'FUERA_DE_HORARIO' });
  });

  it('rechaza franjas bloqueadas o sin tarifa', () => {
    expect(validarReservable({ ...base, bloqueada: true })).toEqual({ ok: false, motivo: 'FRANJA_BLOQUEADA' });
    expect(validarReservable({ ...base, precio: null })).toEqual({ ok: false, motivo: 'SIN_TARIFA' });
  });
});

describe('valores de la reserva (RN-03, RN-04)', () => {
  it('abono del 50 % por defecto o el del complejo, y saldo inicial igual al total', () => {
    expect(calcularValores(80000, 50)).toEqual({ precioTotal: 80000, abonoRequerido: 40000, saldoPendiente: 80000 });
    expect(calcularValores(120000, 30)).toEqual({ precioTotal: 120000, abonoRequerido: 36000, saldoPendiente: 120000 });
  });
});

describe('estados activos (RN-01)', () => {
  it('pendiente de pago, confirmada y pagada ocupan la franja', () => {
    expect(['pendiente_pago', 'confirmada', 'pagada'].every((e) => estaActiva(e as never))).toBe(true);
    expect(['cancelada', 'expirada', 'completada', 'no_asistio'].some((e) => estaActiva(e as never))).toBe(false);
  });

  it('calcula las horas de anticipación', () => {
    expect(horasDeAnticipacion(instanteBogota('2026-11-11', '08:00'), ahora)).toBe(24.5);
  });
});
