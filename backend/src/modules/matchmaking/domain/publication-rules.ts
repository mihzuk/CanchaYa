import { horaAMinutos, instanteBogota } from '../../../shared/utils/time';

export type MotivoNoPublicable = 'RESERVA_NO_CONFIRMADA' | 'ANTICIPACION_INSUFICIENTE';

/** RN-09: solo una reserva confirmada (o pagada) y con al menos N horas de anticipación (3 por defecto). */
export function validarPublicacion(params: { estadoReserva: string; fecha: string; horaInicio: string; horasMinimas: number; ahora: Date }): MotivoNoPublicable | null {
  const { estadoReserva, fecha, horaInicio, horasMinimas, ahora } = params;
  if (estadoReserva !== 'confirmada' && estadoReserva !== 'pagada') return 'RESERVA_NO_CONFIRMADA';
  if (instanteBogota(fecha, horaInicio).getTime() - ahora.getTime() < horasMinimas * 3_600_000) return 'ANTICIPACION_INSUFICIENTE';
  return null;
}

/** RN-10: los cupos de "Faltan jugadores" no superan el tamaño de la modalidad (10 en Fútbol 5). */
export function maximoDeCupos(tipoFutbol: number): number {
  return tipoFutbol * 2;
}

export function cuposValidos(cupos: number, tipoFutbol: number): boolean {
  return Number.isInteger(cupos) && cupos >= 1 && cupos <= maximoDeCupos(tipoFutbol);
}

/** HU-25.2 y 25.3: al aceptar un jugador disminuyen los cupos; con el último, el anuncio se cierra. */
export function trasAceptarJugador(cupos: number): { cupos: number; estado: 'buscando' | 'completo' } {
  const restantes = Math.max(0, cupos - 1);
  return { cupos: restantes, estado: restantes === 0 ? 'completo' : 'buscando' };
}

/** HU-22.4: la reserva con la que se acepta un "busco partido" debe caer en la fecha y el rango pedidos. */
export function reservaDentroDeLoPedido(
  reserva: { fecha: string; horaInicio: string; horaFin: string },
  pedido: { fechaPreferida: string; rangoHoraInicio: string; rangoHoraFin: string },
): boolean {
  return (
    reserva.fecha === pedido.fechaPreferida &&
    horaAMinutos(reserva.horaInicio) >= horaAMinutos(pedido.rangoHoraInicio) &&
    horaAMinutos(reserva.horaFin) <= horaAMinutos(pedido.rangoHoraFin)
  );
}
