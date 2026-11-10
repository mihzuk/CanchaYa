/**
 * API pública del módulo notifications (EP-07). Solo escucha eventos; no importa a ningún módulo.
 */
import './notifications.events';
import { registrarListeners } from './notifications.listeners';

export { notificationsRoutes } from './notifications.routes';
export { registrarDirectorioNotificaciones, type DirectorioNotificaciones } from './notifications.service';

let iniciado = false;

/** Conecta el módulo con el resto del sistema. Idempotente. */
export function iniciarModuloNotificaciones(): void {
  if (iniciado) return;
  iniciado = true;
  registrarListeners();
}
