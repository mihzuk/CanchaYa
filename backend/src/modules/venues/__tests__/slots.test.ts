import { describe, expect, it } from 'vitest';
import { franjaSeCruzaConRango, generarFranjas, marcarFranjas, seCruzan } from '../domain/slots';

describe('generarFranjas (HU-07 criterio 1)', () => {
  it('genera de 8:00 a 23:00 con turnos de 60 minutos: 8:00-9:00 ... 22:00-23:00', () => {
    const franjas = generarFranjas('08:00', '23:00', 60);
    expect(franjas).toHaveLength(15);
    expect(franjas[0]).toEqual({ horaInicio: '08:00', horaFin: '09:00' });
    expect(franjas.at(-1)).toEqual({ horaInicio: '22:00', horaFin: '23:00' });
  });

  it('no ofrece un último turno incompleto', () => {
    const franjas = generarFranjas('08:00', '10:30', 60);
    expect(franjas.map((f) => f.horaInicio)).toEqual(['08:00', '09:00']);
  });

  it('admite turnos de 90 minutos y cierre a medianoche', () => {
    const franjas = generarFranjas('18:00', '24:00', 90);
    expect(franjas).toEqual([
      { horaInicio: '18:00', horaFin: '19:30' },
      { horaInicio: '19:30', horaFin: '21:00' },
      { horaInicio: '21:00', horaFin: '22:30' },
      { horaInicio: '22:30', horaFin: '24:00' },
    ]);
  });

  it('rechaza duraciones no positivas', () => {
    expect(() => generarFranjas('08:00', '09:00', 0)).toThrow();
  });
});

describe('cruces', () => {
  it('detecta franjas que se cruzan y no las contiguas', () => {
    expect(seCruzan({ horaInicio: '08:00', horaFin: '09:00' }, { horaInicio: '08:30', horaFin: '09:30' })).toBe(true);
    expect(seCruzan({ horaInicio: '08:00', horaFin: '09:00' }, { horaInicio: '09:00', horaFin: '10:00' })).toBe(false);
  });

  it('compara una franja con un rango que cruza días', () => {
    const rango = { fechaInicio: '2026-11-14T22:00', fechaFin: '2026-11-15T02:00' };
    expect(franjaSeCruzaConRango('2026-11-14', { horaInicio: '23:00', horaFin: '24:00' }, rango)).toBe(true);
    expect(franjaSeCruzaConRango('2026-11-15', { horaInicio: '02:00', horaFin: '03:00' }, rango)).toBe(false);
    expect(franjaSeCruzaConRango('2026-11-15', { horaInicio: '00:00', horaFin: '01:00' }, rango)).toBe(true);
  });
});

describe('marcarFranjas (HU-09 criterio 1)', () => {
  const franjas = generarFranjas('08:00', '13:00', 60);
  const precio = () => 80000;

  it('marca como bloqueadas las franjas del bloqueo del sábado de 8:00 a 12:00', () => {
    const r = marcarFranjas('2026-11-14', franjas, precio, [{ fechaInicio: '2026-11-14T08:00', fechaFin: '2026-11-14T12:00' }], '2026-11-01T10:00');
    expect(r.map((f) => f.estado)).toEqual(['bloqueada', 'bloqueada', 'bloqueada', 'bloqueada', 'libre']);
  });

  it('marca las franjas que ya empezaron como pasadas', () => {
    const r = marcarFranjas('2026-11-14', franjas, precio, [], '2026-11-14T09:30');
    expect(r.map((f) => f.estado)).toEqual(['pasada', 'pasada', 'libre', 'libre', 'libre']);
  });

  it('una franja sin tarifa no se puede reservar', () => {
    const r = marcarFranjas('2026-11-14', franjas, (f) => (f.horaInicio < '10:00' ? 50000 : null), [], '2026-11-01T00:00');
    expect(r[0]).toMatchObject({ estado: 'libre', precio: 50000 });
    expect(r[3]).toMatchObject({ estado: 'sin_tarifa', precio: null });
  });
});
