import { esFinDeSemanaOFestivo, horaAMinutos } from '../../../shared/utils/time';

export type TipoDia = 'semana' | 'fin_semana_festivo';

export interface Tarifa {
  tipoDia: TipoDia;
  horaInicio: string;
  horaFin: string;
  precio: number;
  activa: boolean;
}

/** HU-08 criterio 2: sábado, domingo o festivo de Colombia usan la tarifa de fin de semana. */
export function tipoDeDia(fecha: string): TipoDia {
  return esFinDeSemanaOFestivo(fecha) ? 'fin_semana_festivo' : 'semana';
}

/**
 * HU-08 criterio 1: precio de una franja. Aplica la tarifa activa del tipo de día que contiene la hora de
 * inicio de la franja (una franja que empieza a las 18:00 usa la tarifa nocturna "desde las 18:00").
 * Si el fin de semana no tiene tarifa propia se usa la de semana. Devuelve `null` si no hay tarifa.
 */
export function precioDeFranja<T extends Tarifa>(fecha: string, horaInicio: string, tarifas: readonly T[]): T | null {
  const inicio = horaAMinutos(horaInicio);
  const activas = tarifas.filter((t) => t.activa);
  const buscar = (tipo: TipoDia) =>
    activas.find((t) => t.tipoDia === tipo && horaAMinutos(t.horaInicio) <= inicio && inicio < horaAMinutos(t.horaFin)) ?? null;
  const tipo = tipoDeDia(fecha);
  return buscar(tipo) ?? (tipo === 'fin_semana_festivo' ? buscar('semana') : null);
}

/** Dos tarifas activas del mismo tipo de día no pueden cruzarse (también lo garantiza la BD). */
export function tarifasSeCruzan(a: Pick<Tarifa, 'tipoDia' | 'horaInicio' | 'horaFin'>, b: Pick<Tarifa, 'tipoDia' | 'horaInicio' | 'horaFin'>): boolean {
  return (
    a.tipoDia === b.tipoDia &&
    horaAMinutos(a.horaInicio) < horaAMinutos(b.horaFin) &&
    horaAMinutos(b.horaInicio) < horaAMinutos(a.horaFin)
  );
}
