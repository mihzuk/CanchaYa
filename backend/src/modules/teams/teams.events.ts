/** Eventos que publica el módulo teams (EP-05). Se consumen vía eventBus (p. ej. notificaciones). */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    JugadorInvitado: { invitacionId: number; equipoId: number; usuarioId: number };
    InvitacionRechazada: { invitacionId: number; equipoId: number; capitanId: number; usuarioId: number };
    CapitaniaPropuesta: { equipoId: number; usuarioId: number };
    /** Busca Partido retira al equipo de sus partidos. */
    EquipoInactivado: { equipoId: number };
  }
}

export {};
