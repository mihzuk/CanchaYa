import { horaAMinutos, minutosAHora } from '../../../shared/utils/time';

export interface Franja {
  horaInicio: string; // 'HH:MM'
  horaFin: string;
}

/**
 * HU-07 criterio 1: genera las franjas reservables desde la apertura, el cierre y la duración del turno.
 * Solo se generan turnos completos: con apertura 8:00, cierre 23:00 y turnos de 60 min resultan
 * 8:00-9:00 ... 22:00-23:00. Si el último turno no cabe completo, no se ofrece.
 */
export function generarFranjas(horaApertura: string, horaCierre: string, duracionTurnoMin: number): Franja[] {
  if (!Number.isInteger(duracionTurnoMin) || duracionTurnoMin <= 0) throw new Error('La duración del turno debe ser positiva');
  const inicio = horaAMinutos(horaApertura);
  const fin = horaAMinutos(horaCierre);
  const franjas: Franja[] = [];
  for (let t = inicio; t + duracionTurnoMin <= fin; t += duracionTurnoMin) {
    franjas.push({ horaInicio: minutosAHora(t), horaFin: minutosAHora(t + duracionTurnoMin) });
  }
  return franjas;
}

export type EstadoFranja = 'libre' | 'bloqueada' | 'pasada' | 'sin_tarifa';

/** Rango en hora local de Bogotá con formato 'YYYY-MM-DDTHH:MM' (comparable como texto). */
export interface RangoLocal {
  fechaInicio: string;
  fechaFin: string;
}

/** Instante local comparable como texto. '24:00' queda antes del día siguiente a las '00:00', como debe. */
const local = (fecha: string, hora: string) => `${fecha}T${hora}`;

export function franjaSeCruzaConRango(fecha: string, franja: Franja, rango: RangoLocal): boolean {
  return local(fecha, franja.horaInicio) < rango.fechaFin && rango.fechaInicio < local(fecha, franja.horaFin);
}

/**
 * Estado de cada franja de un día para un jugador (HU-07, HU-08, HU-09):
 * - `pasada`: ya empezó (según `ahoraLocal`, 'YYYY-MM-DDTHH:MM' en Bogotá).
 * - `bloqueada`: se cruza con un bloqueo del administrador (HU-09).
 * - `sin_tarifa`: no hay tarifa que la cubra; no se puede reservar.
 * - `libre`: disponible con su precio.
 */
export function marcarFranjas(
  fecha: string,
  franjas: readonly Franja[],
  precio: (franja: Franja) => number | null,
  bloqueos: readonly RangoLocal[],
  ahoraLocal: string,
): (Franja & { precio: number | null; estado: EstadoFranja })[] {
  return franjas.map((f) => {
    const p = precio(f);
    let estado: EstadoFranja = 'libre';
    if (local(fecha, f.horaInicio) <= ahoraLocal) estado = 'pasada';
    else if (bloqueos.some((b) => franjaSeCruzaConRango(fecha, f, b))) estado = 'bloqueada';
    else if (p === null) estado = 'sin_tarifa';
    return { ...f, precio: p, estado };
  });
}

/** Dos rangos [a1, a2) y [b1, b2) se cruzan. Las horas se comparan en minutos. */
export function seCruzan(a: Franja, b: Franja): boolean {
  return horaAMinutos(a.horaInicio) < horaAMinutos(b.horaFin) && horaAMinutos(b.horaInicio) < horaAMinutos(a.horaFin);
}
