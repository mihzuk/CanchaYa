import { describe, expect, it } from 'vitest';
import { hayConflictoDeHorario, seCruzanPartidos } from '../domain/schedule-conflict';

const a = { fecha: '2026-11-20', horaInicio: '18:00', horaFin: '19:00' };

describe('cruce de partidos (RN-11)', () => {
  it('detecta partidos solapados el mismo día', () => {
    expect(seCruzanPartidos(a, { ...a })).toBe(true);
    expect(seCruzanPartidos(a, { fecha: a.fecha, horaInicio: '18:30', horaFin: '19:30' })).toBe(true);
  });

  it('los partidos contiguos o de otro día no se cruzan', () => {
    expect(seCruzanPartidos(a, { fecha: a.fecha, horaInicio: '19:00', horaFin: '20:00' })).toBe(false);
    expect(seCruzanPartidos(a, { ...a, fecha: '2026-11-21' })).toBe(false);
  });

  it('compara contra todos los partidos del equipo', () => {
    expect(hayConflictoDeHorario(a, [])).toBe(false);
    expect(hayConflictoDeHorario(a, [{ fecha: a.fecha, horaInicio: '10:00', horaFin: '11:00' }, { ...a }])).toBe(true);
  });
});
