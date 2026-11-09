import { describe, expect, it } from 'vitest';
import { estaVencida, fechaDeExpiracion, segundosRestantes } from '../domain/expiration';

const creacion = new Date('2026-11-07T15:00:00Z');

describe('retención de 15 minutos (RN-02)', () => {
  it('la reserva vence 15 minutos después de crearse', () => {
    expect(fechaDeExpiracion(creacion, 15).toISOString()).toBe('2026-11-07T15:15:00.000Z');
  });

  it('solo una reserva pendiente de pago puede vencer', () => {
    const vence = fechaDeExpiracion(creacion, 15);
    expect(estaVencida({ estado: 'pendiente_pago', fechaExpiracion: vence }, new Date('2026-11-07T15:14:59Z'))).toBe(false);
    expect(estaVencida({ estado: 'pendiente_pago', fechaExpiracion: vence }, new Date('2026-11-07T15:15:00Z'))).toBe(true);
    expect(estaVencida({ estado: 'confirmada', fechaExpiracion: vence }, new Date('2026-11-07T16:00:00Z'))).toBe(false);
  });

  it('cuenta los segundos que quedan para pagar', () => {
    const vence = fechaDeExpiracion(creacion, 15);
    expect(segundosRestantes(vence, new Date('2026-11-07T15:10:00Z'))).toBe(300);
    expect(segundosRestantes(vence, new Date('2026-11-07T15:20:00Z'))).toBe(0);
    expect(segundosRestantes(null, creacion)).toBe(0);
  });

  it('rechaza retenciones no positivas', () => {
    expect(() => fechaDeExpiracion(creacion, 0)).toThrow();
  });
});
