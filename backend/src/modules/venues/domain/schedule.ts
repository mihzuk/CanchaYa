import { diaSemanaIso, horaAMinutos } from '../../../shared/utils/time';
import { generarFranjas, type Franja } from './slots';

/**
 * Un horario abierto tiene horas y turno. Una fecha especial puede estar `cerrado` (sin horas):
 * ese día el complejo no abre aunque el horario habitual diga lo contrario.
 */
export interface Horario {
  diaSemana: number | null; // 1 = lunes ... 7 = domingo
  fechaEspecial: string | null; // 'YYYY-MM-DD'
  cerrado: boolean;
  horaApertura: string | null;
  horaCierre: string | null;
  duracionTurnoMin: number | null;
}

/** Horario de un día en que el complejo abre (con horas y turno). */
export type HorarioAbierto = Horario & { cerrado: false; horaApertura: string; horaCierre: string; duracionTurnoMin: number };

export function estaAbierto(h: Horario | null): h is HorarioAbierto {
  return !!h && !h.cerrado && h.horaApertura !== null && h.horaCierre !== null && h.duracionTurnoMin !== null;
}

/**
 * HU-07 criterio 2: una fecha especial (p. ej. un festivo) reemplaza al horario habitual solo ese día,
 * ya sea con otro horario o como día cerrado. Devuelve `null` si no hay horario para ese día.
 */
export function horarioParaFecha<H extends Horario>(fecha: string, horarios: readonly H[]): H | null {
  const especial = horarios.find((h) => h.fechaEspecial === fecha);
  if (especial) return especial;
  const dia = diaSemanaIso(fecha);
  return horarios.find((h) => h.fechaEspecial === null && h.diaSemana === dia) ?? null;
}

export function franjasDelDia(fecha: string, horarios: readonly Horario[]): Franja[] {
  const h = horarioParaFecha(fecha, horarios);
  return estaAbierto(h) ? generarFranjas(h.horaApertura, h.horaCierre, h.duracionTurnoMin) : [];
}

/**
 * HU-07 criterio 3: indica si una reserva (fecha y rango) queda fuera del horario.
 * Una reserva está dentro si su rango cabe entre la apertura y el cierre del horario de ese día.
 */
export function quedaFueraDeHorario(
  reserva: { fecha: string; horaInicio: string; horaFin: string },
  horarios: readonly Horario[],
): boolean {
  const h = horarioParaFecha(reserva.fecha, horarios);
  if (!estaAbierto(h)) return true;
  return (
    horaAMinutos(reserva.horaInicio) < horaAMinutos(h.horaApertura) || horaAMinutos(reserva.horaFin) > horaAMinutos(h.horaCierre)
  );
}

/** Validación de un horario: el cierre después de la apertura y al menos un turno completo. */
export function validarHorario(h: { horaApertura: string; horaCierre: string; duracionTurnoMin: number }): string | null {
  const apertura = horaAMinutos(h.horaApertura);
  const cierre = horaAMinutos(h.horaCierre);
  if (cierre <= apertura) return 'La hora de cierre debe ser posterior a la de apertura';
  if (cierre - apertura < h.duracionTurnoMin) return 'El horario debe permitir al menos un turno completo';
  return null;
}
