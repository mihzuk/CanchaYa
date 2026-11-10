/** Hechos que solo existen para notificar. Los publican las tareas programadas y otros módulos. */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    /** HU-28.2 */
    RecordatorioPartido: { reservaId: number; usuarioId: number; complejo: string; hora: string };
    /** HU-31.2 */
    InasistenciaReportada: { partidoId: number; adminId: number; equipoId: number };
  }
}

export {};
