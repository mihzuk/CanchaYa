import { describe, expect, it } from 'vitest';
import { abonoFaltante, estadoTrasPago, validarMontoAbono } from '../domain/deposit';

describe('abono (RN-03)', () => {
  const reserva = { abonoRequerido: 40000, saldoPendiente: 80000, totalPagado: 0 };

  it('acepta desde el abono requerido hasta el saldo pendiente', () => {
    expect(validarMontoAbono({ ...reserva, valor: 40000 })).toBeNull();
    expect(validarMontoAbono({ ...reserva, valor: 80000 })).toBeNull();
  });

  it('rechaza menos del abono, más del saldo o valores no enteros', () => {
    expect(validarMontoAbono({ ...reserva, valor: 39999 })).toMatch(/abono mínimo/);
    expect(validarMontoAbono({ ...reserva, valor: 80001 })).toMatch(/supera el saldo/);
    expect(validarMontoAbono({ ...reserva, valor: 40000.5 })).not.toBeNull();
    expect(validarMontoAbono({ ...reserva, valor: 0 })).not.toBeNull();
  });

  it('cuenta lo ya pagado: basta con completar lo que falta del abono', () => {
    const parcial = { abonoRequerido: 60000, saldoPendiente: 80000, totalPagado: 40000 };
    expect(validarMontoAbono({ ...parcial, valor: 20000 })).toBeNull();
    expect(validarMontoAbono({ ...parcial, valor: 19999 })).toMatch(/20000/);
    expect(abonoFaltante(parcial)).toBe(20000);
    expect(abonoFaltante({ abonoRequerido: 40000, saldoPendiente: 80000, totalPagado: 50000 })).toBe(0);
  });
});

describe('estado tras un pago (HU-16, HU-17)', () => {
  it('abono cubierto: confirmada; total cubierto: pagada con saldo 0; si no: pendiente', () => {
    expect(estadoTrasPago({ precioTotal: 80000, abonoRequerido: 40000, totalPagado: 40000 })).toEqual({ estado: 'confirmada', saldoPendiente: 40000 });
    expect(estadoTrasPago({ precioTotal: 80000, abonoRequerido: 40000, totalPagado: 80000 })).toEqual({ estado: 'pagada', saldoPendiente: 0 });
    expect(estadoTrasPago({ precioTotal: 80000, abonoRequerido: 40000, totalPagado: 10000 })).toEqual({ estado: 'pendiente_pago', saldoPendiente: 70000 });
  });
});
