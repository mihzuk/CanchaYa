/** Eventos que publica el módulo payments (EP-04). Se consumen vía eventBus (p. ej. notificaciones). */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    /** Pago aprobado; si confirmó la reserva, `confirmoReserva` es true (HU-28.1). */
    PagoRegistrado: { pagoId: number; reservaId: number; usuarioId: number | null; valor: number; confirmoReserva: boolean; comprobanteEnviado: boolean };
    ReservaCancelada: {
      reservaId: number;
      usuarioId: number | null;
      canceladaPorComplejo: boolean;
      motivo: string | null;
      valorReembolso: number;
    };
    ReservaReprogramada: { reservaAnteriorId: number; reservaNuevaId: number; usuarioId: number | null; movidaPorComplejo: boolean; motivo: string | null };
    ReembolsoResuelto: { reembolsoId: number; reservaId: number; usuarioId: number | null; valor: number };
  }
}

export {};
