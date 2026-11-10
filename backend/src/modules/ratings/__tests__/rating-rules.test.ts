import { describe, expect, it } from 'vitest';
import { promedio } from '../domain/fair-play';
import { equipoCalificable, puedeCalificarComplejo } from '../domain/rating-rules';

describe('Calificaciones (RN-12)', () => {
  it('solo una reserva completada se califica', () => {
    expect(puedeCalificarComplejo('completada')).toBe(true);
    for (const e of ['confirmada', 'pagada', 'cancelada', 'no_asistio', 'pendiente_pago']) expect(puedeCalificarComplejo(e)).toBe(false);
  });

  const jugado = { estado: 'jugado', equipoPublicadorId: 1, equipoRivalId: 2 };
  it('cada equipo participante califica al otro', () => {
    expect(equipoCalificable(jugado, 1)).toBe(2);
    expect(equipoCalificable(jugado, 2)).toBe(1);
  });
  it('un tercero no califica', () => expect(equipoCalificable(jugado, 3)).toBeNull());
  it('un partido sin jugar o sin rival no se califica', () => {
    expect(equipoCalificable({ ...jugado, estado: 'rival_confirmado' }, 1)).toBeNull();
    expect(equipoCalificable({ ...jugado, equipoRivalId: null }, 1)).toBeNull();
  });
});

describe('Promedio de reputación', () => {
  it('un decimal', () => expect(promedio([5, 4, 4])).toBe(4.3));
  it('sin datos es null', () => expect(promedio([])).toBeNull());
});
