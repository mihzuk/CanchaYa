import { horaAMinutos } from '../../../shared/utils/time';

export interface Horario {
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

/** RN-11: dos partidos se cruzan si son el mismo día y sus rangos se solapan (los contiguos no). */
export function seCruzanPartidos(a: Horario, b: Horario): boolean {
  return a.fecha === b.fecha && horaAMinutos(a.horaInicio) < horaAMinutos(b.horaFin) && horaAMinutos(b.horaInicio) < horaAMinutos(a.horaFin);
}

export function hayConflictoDeHorario(nuevo: Horario, existentes: readonly Horario[]): boolean {
  return existentes.some((e) => seCruzanPartidos(nuevo, e));
}
