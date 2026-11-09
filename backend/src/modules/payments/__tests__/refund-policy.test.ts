import { describe, expect, it } from 'vitest';
import { disponibleParaReembolso, porcentajeDeReembolso, reembolsosPorPago, repartirExcedente } from '../domain/refund-policy';

const politica = { pct24h: 100, pct6h: 50 };

describe('política de cancelación (RN-05)', () => {
  it('más de 24 h: 100 %', () => {
    expect(porcentajeDeReembolso(24.01, politica)).toBe(100);
    expect(porcentajeDeReembolso(72, politica)).toBe(100);
  });

  it('entre 6 y 24 h (ambos incluidos): 50 %', () => {
    expect(porcentajeDeReembolso(24, politica)).toBe(50);
    expect(porcentajeDeReembolso(12, politica)).toBe(50);
    expect(porcentajeDeReembolso(6, politica)).toBe(50);
  });

  it('menos de 6 h: sin reembolso', () => {
    expect(porcentajeDeReembolso(5.99, politica)).toBe(0);
    expect(porcentajeDeReembolso(0.5, politica)).toBe(0);
  });

  it('si cancela el complejo siempre se reembolsa el 100 %', () => {
    expect(porcentajeDeReembolso(1, politica, true)).toBe(100);
  });

  it('usa los porcentajes configurados por el superadministrador (HU-33.3)', () => {
    expect(porcentajeDeReembolso(30, { pct24h: 90, pct6h: 40 })).toBe(90);
    expect(porcentajeDeReembolso(10, { pct24h: 90, pct6h: 40 })).toBe(40);
  });
});

describe('reembolsos por pago', () => {
  it('aplica el porcentaje sobre lo disponible de cada pago y no crea reembolsos en cero', () => {
    expect(reembolsosPorPago([{ id: 1, disponible: 40000 }, { id: 2, disponible: 40000 }], 50)).toEqual([
      { pagoId: 1, valor: 20000 },
      { pagoId: 2, valor: 20000 },
    ]);
    expect(reembolsosPorPago([{ id: 1, disponible: 40000 }], 0)).toEqual([]);
    expect(reembolsosPorPago([{ id: 1, disponible: 0 }], 100)).toEqual([]);
  });

  it('lo disponible descuenta reembolsos pagados y pendientes', () => {
    expect(disponibleParaReembolso({ valor: 120000, reembolsado: 40000, reembolsoPendiente: 0 })).toBe(80000);
    expect(disponibleParaReembolso({ valor: 120000, reembolsado: 40000, reembolsoPendiente: 80000 })).toBe(0);
  });

  it('reparte el excedente de una reprogramación entre varios pagos (del más nuevo al más antiguo)', () => {
    const pagos = [
      { id: 3, disponible: 10000 },
      { id: 2, disponible: 50000 },
      { id: 1, disponible: 60000 },
    ];
    expect(repartirExcedente(pagos, 40000)).toEqual({
      reembolsos: [
        { pagoId: 3, valor: 10000 },
        { pagoId: 2, valor: 30000 },
      ],
      cubierto: 40000,
    });
    expect(repartirExcedente([{ id: 1, disponible: 5000 }], 8000).cubierto).toBe(5000);
  });
});
