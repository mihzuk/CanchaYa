/**
 * API pública del módulo auth (EP-01): lo único que otros módulos pueden importar.
 */
import { eventBus } from '../../shared/events/eventBus';
import { configurarResolverUsuario } from '../../shared/middleware/authenticate';
import { authService } from './auth.service';

export { authRoutes, usuariosRoutes } from './auth.routes';
export { registrarContribuyentePerfil } from './auth.service';
export type { UsuarioDto, PerfilPublicoDto, Nivel, Posicion } from './auth.dto';

let iniciado = false;

/** Conecta el módulo con el resto del sistema. Idempotente. */
export function iniciarModuloAuth(): void {
  if (iniciado) return;
  iniciado = true;
  configurarResolverUsuario((id) => authService.sesion(id));
  // Quien registra un complejo pasa a ser administrador de complejo (HU-05).
  eventBus.on('ComplejoRegistrado', ({ adminId }) => authService.promoverAAdminComplejo(adminId));
}

/** Para el módulo admin (HU-33). */
export const authApi = {
  obtenerUsuario: (id: number) => authService.obtenerUsuario(id),
};
