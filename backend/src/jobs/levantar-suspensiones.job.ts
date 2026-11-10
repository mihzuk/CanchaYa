import { matchmakingApi } from '../modules/matchmaking';
import type { Tarea } from './tarea';

/** Cada minuto (HT-06.4, RN-08): levanta las suspensiones vencidas. */
export const levantarSuspensionesJob: Tarea = {
  nombre: 'levantar-suspensiones',
  intervaloMs: 60_000,
  ejecutar: async (ahora) => {
    const n = await matchmakingApi.levantarSuspensiones(ahora);
    return n ? `${n} suspensión(es) levantada(s)` : undefined;
  },
};
