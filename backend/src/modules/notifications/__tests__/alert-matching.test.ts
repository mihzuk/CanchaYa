import { describe, expect, it } from 'vitest';
import { coincideConPreferencia, type PartidoParaAlerta, type PreferenciaAlerta } from '../domain/alert-matching';

const preferencia: PreferenciaAlerta = { dias: [3], horaInicio: '18:00', horaFin: '22:00', zona: null, nivel: null, tipoFutbol: null };
// 2026-11-11 es miércoles.
const partido: PartidoParaAlerta = { fecha: '2026-11-11', horaInicio: '19:00', ciudad: 'Medellín', barrio: 'Laureles', zona: null, nivel: 'intermedio', tipoFutbol: 5 };

describe('Alertas (HU-29.1)', () => {
  it('coincide con día y rango de horas', () => expect(coincideConPreferencia(preferencia, partido)).toBe(true));
  it('otro día no coincide', () => expect(coincideConPreferencia({ ...preferencia, dias: [1, 2] }, partido)).toBe(false));
  it('la hora final del rango queda por fuera', () => {
    expect(coincideConPreferencia(preferencia, { ...partido, horaInicio: '22:00' })).toBe(false);
    expect(coincideConPreferencia(preferencia, { ...partido, horaInicio: '18:00' })).toBe(true);
    expect(coincideConPreferencia(preferencia, { ...partido, horaInicio: '17:00' })).toBe(false);
  });
  it('filtra por nivel y modalidad', () => {
    expect(coincideConPreferencia({ ...preferencia, nivel: 'avanzado' }, partido)).toBe(false);
    expect(coincideConPreferencia({ ...preferencia, nivel: 'intermedio' }, partido)).toBe(true);
    expect(coincideConPreferencia({ ...preferencia, tipoFutbol: 7 }, partido)).toBe(false);
  });
  it('la zona ignora tildes y mayúsculas, y mira ciudad y barrio', () => {
    expect(coincideConPreferencia({ ...preferencia, zona: 'medellin' }, partido)).toBe(true);
    expect(coincideConPreferencia({ ...preferencia, zona: 'LAURELES' }, partido)).toBe(true);
    expect(coincideConPreferencia({ ...preferencia, zona: 'Bogotá' }, partido)).toBe(false);
  });
  it('compara palabras completas, no pedazos de palabra', () => {
    expect(coincideConPreferencia({ ...preferencia, zona: 'Cali' }, { ...partido, ciudad: 'Calima', barrio: 'Centro' })).toBe(false);
    expect(coincideConPreferencia({ ...preferencia, zona: 'Laureles, Medellín' }, partido)).toBe(true);
  });
  it('un partido sin fecha no alerta', () => expect(coincideConPreferencia(preferencia, { ...partido, fecha: null })).toBe(false));
});
