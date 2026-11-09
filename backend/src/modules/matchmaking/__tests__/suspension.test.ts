import { describe, expect, it } from 'vitest';
import { debeSuspenderse, estaSuspendido, finDeSuspension } from '../domain/suspension';

const ahora = new Date('2026-11-20T12:00:00Z');
const haceDias = (d: number) => new Date(ahora.getTime() - d * 86_400_000);

describe('suspensión de Busca Partido (RN-07, RN-08)', () => {
  it('un equipo está suspendido solo hasta la fecha indicada', () => {
    expect(estaSuspendido(null, ahora)).toBe(false);
    expect(estaSuspendido('2026-11-21T00:00:00Z', ahora)).toBe(true);
    expect(estaSuspendido('2026-11-20T12:00:00Z', ahora)).toBe(false);
  });

  it('3 inasistencias en 60 días suspenden; las más antiguas no cuentan', () => {
    expect(debeSuspenderse([haceDias(1), haceDias(30), haceDias(59)], ahora)).toBe(true);
    expect(debeSuspenderse([haceDias(1), haceDias(30)], ahora)).toBe(false);
    expect(debeSuspenderse([haceDias(1), haceDias(30), haceDias(61)], ahora)).toBe(false);
  });

  it('la suspensión dura 15 días', () => {
    expect(finDeSuspension(ahora).toISOString()).toBe('2026-12-05T12:00:00.000Z');
  });
});
