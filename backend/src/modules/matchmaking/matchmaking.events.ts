/** Eventos que publica el módulo matchmaking (EP-06). Se consumen vía eventBus (p. ej. notificaciones). */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    PartidoPublicado: { partidoId: number; equipoId: number };
    PostulacionRecibida: { partidoId: number; postulacionId: number; equipoId: number; equipoPublicadorId: number };
    RivalConfirmado: { partidoId: number; equipoPublicadorId: number; equipoRivalId: number; equiposRechazados: number[] };
    PostulacionRechazada: { partidoId: number; equipoId: number };
    InscripcionRecibida: { partidoId: number; inscripcionId: number; usuarioId: number; equipoPublicadorId: number };
    InscripcionResuelta: { partidoId: number; inscripcionId: number | null; usuarioId: number; aceptada: boolean };
    /** HU-12.4: `jugadores` son los inscritos con cupo aceptado, a quienes también hay que avisar. */
    PartidoCancelado: {
      partidoId: number;
      equipoPublicadorId: number;
      equipoRivalId: number | null;
      jugadores: number[];
      motivo: 'capitan' | 'reserva_cancelada' | 'equipo_inactivo';
    };
    PartidoJugado: { partidoId: number; equipoPublicadorId: number; equipoRivalId: number | null };
    RivalRetirado: { partidoId: number; equipoPublicadorId: number; equipoRivalId: number };
  }
}

export {};
