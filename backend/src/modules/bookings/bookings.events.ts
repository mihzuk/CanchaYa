/** Eventos que publica el módulo bookings (EP-03). Se consumen vía eventBus (p. ej. notificaciones). */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    ReservaCreada: { reservaId: number; usuarioId: number | null; canchaId: number; fecha: string; horaInicio: string; origen: 'web' | 'manual' };
    ReservaExpirada: { reservaId: number; usuarioId: number | null; canchaId: number; fecha: string; horaInicio: string };
    ReservaEstadoCambiado: { reservaId: number; usuarioId: number | null; estado: 'completada' | 'no_asistio' };
  }
}

export {};
