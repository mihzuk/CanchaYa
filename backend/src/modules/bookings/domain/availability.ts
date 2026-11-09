import { horaAMinutos } from '../../../shared/utils/time';

/**
 * HU-10: franjas libres = horario − reservas − bloqueos. Las reservas activas de una cancha marcan
 * sus franjas como "reservada" (rojo); un marcador opcional permite a Busca Partido marcar las suyas
 * como "partido_abierto" (amarillo).
 */
export type EstadoDisponibilidad = 'libre' | 'reservada' | 'bloqueada' | 'pasada' | 'sin_tarifa' | 'partido_abierto';

export interface FranjaBase {
  horaInicio: string;
  horaFin: string;
  precio: number | null;
  estado: 'libre' | 'bloqueada' | 'pasada' | 'sin_tarifa';
}

export interface FranjaDisponible {
  horaInicio: string;
  horaFin: string;
  precio: number | null;
  estado: EstadoDisponibilidad;
}

const seCruzan = (a: { horaInicio: string; horaFin: string }, b: { horaInicio: string; horaFin: string }) =>
  horaAMinutos(a.horaInicio) < horaAMinutos(b.horaFin) && horaAMinutos(b.horaInicio) < horaAMinutos(a.horaFin);

/**
 * Combina las franjas calculadas por venues con las reservas activas del día.
 * `reservasConPartido` son las reservas publicadas en Busca Partido con cupos (HU-10.2, amarillo).
 */
export function combinarConReservas(
  franjas: readonly FranjaBase[],
  reservasActivas: readonly { id: number; horaInicio: string; horaFin: string }[],
  reservasConPartido: ReadonlySet<number> = new Set(),
): FranjaDisponible[] {
  return franjas.map((f) => {
    const reserva = reservasActivas.find((r) => seCruzan(f, r));
    if (!reserva || f.estado === 'pasada') return { ...f };
    return { ...f, estado: reservasConPartido.has(reserva.id) ? 'partido_abierto' : 'reservada' };
  });
}

/** Filtra por rango de horas de inicio [desde, hasta) (HU-10.1). */
export function enRangoDeHoras(f: { horaInicio: string }, desde?: string, hasta?: string): boolean {
  const m = horaAMinutos(f.horaInicio);
  return (desde === undefined || m >= horaAMinutos(desde)) && (hasta === undefined || m < horaAMinutos(hasta));
}

/** Distancia en km entre dos coordenadas (fórmula del haversine). */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/**
 * HU-10 criterio 3: si no hay resultados en el rango pedido, se sugieren las franjas libres más
 * cercanas a la hora deseada (mismo día), ordenadas por cercanía.
 */
export function sugerirCercanas<T extends { horaInicio: string; estado: EstadoDisponibilidad }>(
  franjas: readonly T[],
  horaDeseada: string,
  maximo = 5,
): T[] {
  const objetivo = horaAMinutos(horaDeseada);
  return franjas
    .filter((f) => f.estado === 'libre')
    .sort((a, b) => Math.abs(horaAMinutos(a.horaInicio) - objetivo) - Math.abs(horaAMinutos(b.horaInicio) - objetivo))
    .slice(0, maximo);
}
