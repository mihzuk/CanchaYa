/** RN-12 / HU-30.1: solo se califica una reserva completada. */
export function puedeCalificarComplejo(estadoReserva: string): boolean {
  return estadoReserva === 'completada';
}

/** RN-12 / HU-31.1: solo un partido jugado, y solo los dos equipos que participaron. */
export function equipoCalificable(partido: { estado: string; equipoPublicadorId: number; equipoRivalId: number | null }, equipoCalificadorId: number): number | null {
  if (partido.estado !== 'jugado' || partido.equipoRivalId === null) return null;
  if (equipoCalificadorId === partido.equipoPublicadorId) return partido.equipoRivalId;
  if (equipoCalificadorId === partido.equipoRivalId) return partido.equipoPublicadorId;
  return null;
}
