import { matchmakingApi } from '../modules/matchmaking';
import type { Tarea } from './tarea';

/** Cada minuto (HT-06.3, HU-26.2): si el rival no paga su abono en 2 horas, el partido vuelve a buscar rival. */
export const anularConfirmacionRivalJob: Tarea = {
  nombre: 'anular-confirmacion-rival',
  intervaloMs: 60_000,
  ejecutar: async (ahora) => {
    const n = await matchmakingApi.anularRivalesMorosos(ahora);
    return n ? `${n} confirmación(es) anulada(s)` : undefined;
  },
};
