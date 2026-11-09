import { describe, expect, it } from 'vitest';
import { avanceDePago, dividirValor } from '../domain/split-payment';

describe('pago dividido entre equipos (HU-26)', () => {
  it('50 % por defecto', () => {
    expect(dividirValor(120000, 50)).toEqual({ publicador: 60000, rival: 60000 });
  });

  it('respeta el porcentaje acordado y la suma siempre es el total', () => {
    const r = dividirValor(100001, 33.33);
    expect(r.publicador + r.rival).toBe(100001);
    expect(r.rival).toBe(33330);
  });

  it('rechaza porcentajes fuera de 0 a 100', () => {
    expect(() => dividirValor(1000, 120)).toThrow();
  });

  it('muestra cuánto ha pagado cada equipo de su parte (HU-17.2)', () => {
    expect(avanceDePago(60000, 30000)).toEqual({ parte: 60000, pagado: 30000, pendiente: 30000 });
    expect(avanceDePago(60000, 70000).pendiente).toBe(0);
  });
});
