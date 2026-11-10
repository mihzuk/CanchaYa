import { describe, expect, it } from 'vitest';
import {
  fechaLegible,
  diaSemanaIso,
  esFechaValida,
  esHoraValida,
  festivosColombia,
  hoyBogota,
  instanteBogota,
  normalizarHora,
  partesBogota,
  sumarDias,
} from '../time';
import { formatearCOP, porcentajeDe } from '../money';

describe('zona horaria America/Bogota (RNF-09)', () => {
  it('convierte instantes UTC a hora local de Bogotá (UTC-5)', () => {
    expect(partesBogota(new Date('2026-11-07T03:30:00Z'))).toMatchObject({ fecha: '2026-11-06', hora: '22:30' });
    expect(hoyBogota(new Date('2026-11-07T05:00:00Z'))).toBe('2026-11-07');
  });

  it('construye el instante de una fecha y hora locales, incluso a medianoche (24:00)', () => {
    expect(instanteBogota('2026-11-07', '18:00').toISOString()).toBe('2026-11-07T23:00:00.000Z');
    expect(instanteBogota('2026-11-07', '24:00').toISOString()).toBe('2026-11-08T05:00:00.000Z');
  });

  it('valida fechas y horas', () => {
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esHoraValida('24:00')).toBe(true);
    expect(esHoraValida('24:30')).toBe(false);
    expect(esHoraValida('7:00')).toBe(false);
    expect(normalizarHora('08:00:00')).toBe('08:00');
  });

  it('aritmética de días y día de la semana ISO', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diaSemanaIso('2026-11-09')).toBe(1); // lunes
    expect(diaSemanaIso('2026-11-08')).toBe(7); // domingo
  });
});

describe('festivos de Colombia (Ley 51 de 1983)', () => {
  it('calcula los 18 festivos de 2026', () => {
    const f = [...festivosColombia(2026)].sort();
    expect(f).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18',
      '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12',
      '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });
});

describe('pesos colombianos', () => {
  it('redondea porcentajes al peso y formatea COP', () => {
    expect(porcentajeDe(80000, 50)).toBe(40000);
    expect(porcentajeDe(75000, 33.33)).toBe(24998);
    expect(formatearCOP(120000).replace(/\s/g, ' ')).toMatch(/120\.000/);
  });
});

describe('fechaLegible (mensajes al usuario)', () => {
  it('muestra día de la semana y mes sin desfase de zona horaria', () => {
    expect(fechaLegible('2026-11-26')).toBe('jue, 26 de nov');
    expect(fechaLegible('2026-01-04')).toBe('dom, 4 de ene');
  });
  it('tolera valores vacíos o inválidos', () => {
    expect(fechaLegible(null)).toBe('');
    expect(fechaLegible('no-fecha')).toBe('no-fecha');
  });
});
