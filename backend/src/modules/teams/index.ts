/**
 * API pública del módulo teams (EP-05): lo único que otros módulos pueden importar.
 */
import './teams.events';
import type { Queryable } from '../../shared/database/pool';
import { teamsRepository as repo } from './teams.repository';

export { teamsRoutes } from './teams.routes';
export { registrarDirectorioUsuarios, type UsuarioDirectorio } from './teams.service';
export type { EquipoDto, NivelEquipo } from './teams.dto';

/** Operaciones que usan matchmaking, ratings y el perfil público. */
export const teamsApi = {
  obtener: repo.obtener,
  porIds: repo.porIds,
  esMiembro: repo.esMiembro,
  capitaneadosPor: repo.idsCapitaneados,
  capitanes: repo.capitanes,
  aplicarInasistencia: repo.aplicarInasistencia,
  marcarCancelacionTardia: repo.marcarCancelacionTardia,
  levantarSuspensiones: repo.levantarSuspensiones,
  /** Bloquea la fila del equipo dentro de una transacción (RN-11). */
  async bloquear(id: number, db: Queryable) {
    return repo.obtener(id, db, true);
  },
  /** Para el perfil público (HU-04.2). */
  async equiposDeUsuario(usuarioId: number) {
    return (await repo.deUsuario(usuarioId)).map((e) => ({ id: e.id, nombre: e.nombre, escudoUrl: e.escudoUrl }));
  },
};
