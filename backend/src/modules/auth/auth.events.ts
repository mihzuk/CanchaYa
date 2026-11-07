/** Eventos que publica el módulo auth (EP-01). Se consumen vía eventBus. */
declare module '../../shared/events/eventBus' {
  interface EventosDelSistema {
    UsuarioRegistrado: { usuarioId: number };
  }
}

export {};
