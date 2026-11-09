import { matchmakingApi } from '../modules/matchmaking';
import type { Tarea } from './tarea';

/**
 * Cada 5 minutos: cierra los partidos cuya reserva ya terminó. Los eventos lo hacen al instante; esta
 * tarea cubre el caso de un evento perdido (el bus es en memoria).
 */
export const sincronizarPartidosJob: Tarea = {
  nombre: 'sincronizar-partidos',
  intervaloMs: 5 * 60_000,
  ejecutar: async () => {
    const n = await matchmakingApi.reconciliar();
    return n ? `${n} partido(s) cerrado(s)` : undefined;
  },
};
