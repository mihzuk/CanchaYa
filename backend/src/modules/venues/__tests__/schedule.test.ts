import { describe, expect, it } from 'vitest';
import { franjasDelDia, horarioParaFecha, quedaFueraDeHorario, validarHorario, type Horario } from '../domain/schedule';

const semana = (apertura: string, cierre: string): Horario[] =>
  [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, fechaEspecial: null, horaApertura: apertura, horaCierre: cierre, duracionTurnoMin: 60 }));

describe('horarioParaFecha (HU-07 criterio 2)', () => {
  const horarios: Horario[] = [
    ...semana('08:00', '23:00'),
    // Lunes festivo 2026-11-02 (Todos los Santos trasladado): horario especial.
    { diaSemana: null, fechaEspecial: '2026-11-02', horaApertura: '10:00', horaCierre: '18:00', duracionTurnoMin: 60 },
  ];

  it('usa el horario habitual del día de la semana', () => {
    expect(horarioParaFecha('2026-11-09', horarios)).toMatchObject({ horaApertura: '08:00', horaCierre: '23:00' });
  });

  it('la fecha especial reemplaza al horario habitual solo ese día', () => {
    expect(horarioParaFecha('2026-11-02', horarios)).toMatchObject({ horaApertura: '10:00', horaCierre: '18:00' });
    expect(franjasDelDia('2026-11-02', horarios)).toHaveLength(8);
    expect(franjasDelDia('2026-11-03', horarios)).toHaveLength(15);
  });

  it('devuelve null y sin franjas si el complejo no abre ese día', () => {
    expect(horarioParaFecha('2026-11-08', horarios)).toBeNull(); // domingo
    expect(franjasDelDia('2026-11-08', horarios)).toEqual([]);
  });
});

describe('quedaFueraDeHorario (HU-07 criterio 3)', () => {
  const horarios = semana('10:00', '20:00');

  it('detecta reservas antes de la apertura, después del cierre o en días cerrados', () => {
    expect(quedaFueraDeHorario({ fecha: '2026-11-09', horaInicio: '08:00', horaFin: '09:00' }, horarios)).toBe(true);
    expect(quedaFueraDeHorario({ fecha: '2026-11-09', horaInicio: '19:30', horaFin: '20:30' }, horarios)).toBe(true);
    expect(quedaFueraDeHorario({ fecha: '2026-11-08', horaInicio: '12:00', horaFin: '13:00' }, horarios)).toBe(true);
  });

  it('una reserva dentro del horario no genera advertencia', () => {
    expect(quedaFueraDeHorario({ fecha: '2026-11-09', horaInicio: '10:00', horaFin: '11:00' }, horarios)).toBe(false);
    expect(quedaFueraDeHorario({ fecha: '2026-11-09', horaInicio: '19:00', horaFin: '20:00' }, horarios)).toBe(false);
  });
});

describe('validarHorario', () => {
  it('exige cierre posterior a la apertura y al menos un turno completo', () => {
    expect(validarHorario({ horaApertura: '10:00', horaCierre: '09:00', duracionTurnoMin: 60 })).not.toBeNull();
    expect(validarHorario({ horaApertura: '10:00', horaCierre: '10:30', duracionTurnoMin: 60 })).not.toBeNull();
    expect(validarHorario({ horaApertura: '08:00', horaCierre: '23:00', duracionTurnoMin: 60 })).toBeNull();
  });
});
