/** Eventos que publica el módulo venues (EP-02). Se consumen vía eventBus. */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    /** Un usuario registró un complejo: pasa a ser administrador de complejo (lo atiende auth). */
    ComplejoRegistrado: { complejoId: number; adminId: number };
    ComplejoAprobado: { complejoId: number; adminId: number; nombre: string };
    ComplejoRechazado: { complejoId: number; adminId: number; nombre: string; motivo: string };
  }
}

export {};
