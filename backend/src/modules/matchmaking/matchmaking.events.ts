/** Eventos que publica el módulo matchmaking (EP-06). Se consumen vía eventBus (p. ej. notificaciones). */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    /** Con los datos que necesita una alerta (HU-29). */
    PartidoPublicado: {
      partidoId: number;
      equipoId: number;
      fecha: string | null;
      horaInicio: string | null;
      ciudad: string | null;
      barrio: string | null;
      zona: string | null;
      nivel: string;
      tipoFutbol: number;
      modalidad: string;
    };
    PostulacionRecibida: { partidoId: number; postulacionId: number; equipoId: number; equipoPublicadorId: number };
    /** `equipoDeudorId`: el que debe pagar su abono (el rival; en "sin cancha", el publicador). */
    RivalConfirmado: { partidoId: number; equipoPublicadorId: number; equipoRivalId: number; equipoDeudorId: number; equiposRechazados: number[]; horasParaPagar: number };
    PostulacionRechazada: { partidoId: number; equipoId: number };
    InscripcionRecibida: { partidoId: number; inscripcionId: number; usuarioId: number; equipoPublicadorId: number };
    InscripcionResuelta: { partidoId: number; inscripcionId: number | null; usuarioId: number; aceptada: boolean };
    /** HU-12.4: `jugadores` son los inscritos con cupo aceptado, a quienes también hay que avisar. */
    PartidoCancelado: {
      partidoId: number;
      equipoPublicadorId: number;
      equipoRivalId: number | null;
      jugadores: number[];
      /** El equipo de la reserva: si la canceló o la movió, ya recibió su propio aviso. */
      equipoDuenoId: number;
      motivo: 'capitan' | 'reserva_cancelada' | 'equipo_inactivo';
    };
    PartidoJugado: { partidoId: number; equipoPublicadorId: number; equipoRivalId: number | null };
    RivalRetirado: { partidoId: number; equipoPublicadorId: number; equipoRivalId: number; tardio: boolean };
    /** HU-26.2: el equipo que debía pagar no lo hizo a tiempo. */
    RivalAnulado: { partidoId: number; equipoPublicadorId: number; equipoRivalId: number; equipoDeudorId: number };
    /** HU-22.3 */
    AlertaSinRival: { partidoId: number; equipoPublicadorId: number };
    EquipoSuspendido: { equipoId: number; hasta: string };
    SuspensionLevantada: { equipoId: number };
  }
}

export {};
