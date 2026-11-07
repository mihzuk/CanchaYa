import { describe, expect, it } from 'vitest';
import { precioDeFranja, tarifasSeCruzan, tipoDeDia, type Tarifa } from '../domain/rates';

const tarifas: Tarifa[] = [
  { tipoDia: 'semana', horaInicio: '08:00', horaFin: '18:00', precio: 80000, activa: true },
  { tipoDia: 'semana', horaInicio: '18:00', horaFin: '23:00', precio: 120000, activa: true },
  { tipoDia: 'fin_semana_festivo', horaInicio: '08:00', horaFin: '23:00', precio: 140000, activa: true },
  { tipoDia: 'semana', horaInicio: '08:00', horaFin: '23:00', precio: 1, activa: false },
];

describe('tipoDeDia (HU-08 criterio 2)', () => {
  it('lunes a viernes es semana; sábado, domingo y festivos usan la tarifa de fin de semana', () => {
    expect(tipoDeDia('2026-11-10')).toBe('semana'); // martes
    expect(tipoDeDia('2026-11-14')).toBe('fin_semana_festivo'); // sábado
    expect(tipoDeDia('2026-11-15')).toBe('fin_semana_festivo'); // domingo
    expect(tipoDeDia('2026-11-16')).toBe('fin_semana_festivo'); // lunes festivo (Independencia de Cartagena trasladado)
    expect(tipoDeDia('2026-12-08')).toBe('fin_semana_festivo'); // martes, Inmaculada Concepción
  });
});

describe('precioDeFranja (HU-08 criterio 1)', () => {
  it('tarifa diurna y nocturna desde las 18:00', () => {
    expect(precioDeFranja('2026-11-10', '17:00', tarifas)?.precio).toBe(80000);
    expect(precioDeFranja('2026-11-10', '18:00', tarifas)?.precio).toBe(120000);
    expect(precioDeFranja('2026-11-10', '22:00', tarifas)?.precio).toBe(120000);
  });

  it('tarifa de fin de semana y festivo', () => {
    expect(precioDeFranja('2026-11-14', '10:00', tarifas)?.precio).toBe(140000);
    expect(precioDeFranja('2026-11-16', '20:00', tarifas)?.precio).toBe(140000);
  });

  it('si no hay tarifa de fin de semana se usa la de semana', () => {
    const soloSemana = tarifas.filter((t) => t.tipoDia === 'semana');
    expect(precioDeFranja('2026-11-14', '19:00', soloSemana)?.precio).toBe(120000);
  });

  it('ignora tarifas inactivas y devuelve null fuera de toda tarifa', () => {
    expect(precioDeFranja('2026-11-10', '07:00', tarifas)).toBeNull();
    expect(precioDeFranja('2026-11-10', '23:00', tarifas)).toBeNull();
  });
});

describe('tarifasSeCruzan', () => {
  it('solo se cruzan tarifas del mismo tipo de día con rangos superpuestos', () => {
    const a = { tipoDia: 'semana' as const, horaInicio: '08:00', horaFin: '18:00' };
    expect(tarifasSeCruzan(a, { tipoDia: 'semana', horaInicio: '17:00', horaFin: '20:00' })).toBe(true);
    expect(tarifasSeCruzan(a, { tipoDia: 'semana', horaInicio: '18:00', horaFin: '20:00' })).toBe(false);
    expect(tarifasSeCruzan(a, { tipoDia: 'fin_semana_festivo', horaInicio: '08:00', horaFin: '18:00' })).toBe(false);
  });
});
