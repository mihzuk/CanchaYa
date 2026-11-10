/** API pública del módulo ratings (EP-08): lo único que otros módulos pueden importar. */
import { registrarReputacionEquipos } from '../matchmaking';
import { ratingsService } from './ratings.service';

export { ratingsRoutes } from './ratings.routes';

let iniciado = false;

/** Conecta el módulo con el resto del sistema. Idempotente. */
export function iniciarModuloRatings(): void {
  if (iniciado) return;
  iniciado = true;
  registrarReputacionEquipos((ids) => ratingsService.fairPlayDeEquipos(ids)); // HU-22.2
}

export const ratingsApi = {
  promediosDeComplejos: (ids: number[]) => ratingsService.promediosDeComplejos(ids),
  fairPlayDeEquipos: (ids: number[]) => ratingsService.fairPlayDeEquipos(ids),
};
