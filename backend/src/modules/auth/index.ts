/**
 * API pública del módulo auth (EP-01): lo único que otros módulos pueden importar.
 */
import { eventBus } from '../../shared/events/eventBus';
import { configurarResolverUsuario } from '../../shared/middleware/authenticate';
import { authRepository } from './auth.repository';
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
  /** Nombres visibles (sin datos de contacto) de varios usuarios. */
  nombresDeUsuarios: (ids: number[]) => authRepository.nombres(ids),
  /** Datos públicos (sin contacto) para plantillas e inscripciones. */
  usuariosPublicos: (ids: number[]) => authRepository.publicos(ids),
  async usuarioPublicoPorUsername(username: string) {
    const u = await authRepository.buscarPorUsername(username);
    if (!u || u.estado !== 'activo') return undefined;
    return { id: u.id, username: u.username, nombre: `${u.nombres} ${u.apellidos}`, fotoUrl: u.foto_url };
  },
};
