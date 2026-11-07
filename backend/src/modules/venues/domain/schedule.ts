import { diaSemanaIso, horaAMinutos } from '../../../shared/utils/time';
import { generarFranjas, type Franja } from './slots';

export interface Horario {
  diaSemana: number | null; // 1 = lunes ... 7 = domingo
  fechaEspecial: string | null; // 'YYYY-MM-DD'
  horaApertura: string;
  horaCierre: string;
  duracionTurnoMin: number;
}

/**
 * HU-07 criterio 2: una fecha especial (p. ej. un festivo) reemplaza al horario habitual solo ese día.
 * Devuelve `null` si el complejo no abre ese día.
 */
export function horarioParaFecha<H extends Horario>(fecha: string, horarios: readonly H[]): H | null {
  const especial = horarios.find((h) => h.fechaEspecial === fecha);
  if (especial) return especial;
  const dia = diaSemanaIso(fecha);
  return horarios.find((h) => h.fechaEspecial === null && h.diaSemana === dia) ?? null;
}

export function franjasDelDia(fecha: string, horarios: readonly Horario[]): Franja[] {
  const h = horarioParaFecha(fecha, horarios);
  return h ? generarFranjas(h.horaApertura, h.horaCierre, h.duracionTurnoMin) : [];
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
  if (!h) return true;
  return (
    horaAMinutos(reserva.horaInicio) < horaAMinutos(h.horaApertura) || horaAMinutos(reserva.horaFin) > horaAMinutos(h.horaCierre)
  );
}

/** Validación de un horario: el cierre después de la apertura y al menos un turno completo. */
export function validarHorario(h: Pick<Horario, 'horaApertura' | 'horaCierre' | 'duracionTurnoMin'>): string | null {
  const apertura = horaAMinutos(h.horaApertura);
  const cierre = horaAMinutos(h.horaCierre);
  if (cierre <= apertura) return 'La hora de cierre debe ser posterior a la de apertura';
  if (cierre - apertura < h.duracionTurnoMin) return 'El horario debe permitir al menos un turno completo';
  return null;
}
