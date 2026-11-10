import { bookingsApi } from '../modules/bookings';
import { matchmakingApi } from '../modules/matchmaking';
import { eventBus } from '../shared/events/eventBus';
import { hoyBogota, instanteBogota, sumarDias } from '../shared/utils/time';
import type { Tarea } from './tarea';

const DOS_HORAS = 2 * 3_600_000;

/**
 * Cada minuto (HT-06.2): recordatorio 2 horas antes del partido (HU-28.2) y alerta de partido sin rival
 * 6 horas antes (HU-22.3). Los dos son idempotentes: se envían una sola vez.
 */
export const recordatoriosJob: Tarea = {
  nombre: 'recordatorios',
  intervaloMs: 60_000,
  ejecutar: async (ahora) => {
    const hoy = hoyBogota(ahora);
    const reservas = await bookingsApi.confirmadasEnFechas(hoy, sumarDias(hoy, 1));
    for (const r of reservas) {
      const faltan = instanteBogota(r.fecha, r.horaInicio).getTime() - ahora.getTime();
      if (r.usuarioId === null || faltan <= 0 || faltan > DOS_HORAS) continue;
      await eventBus.emit('RecordatorioPartido', { reservaId: r.id, usuarioId: r.usuarioId, complejo: r.complejo.nombre, hora: r.horaInicio });
    }
    const alertas = await matchmakingApi.alertarSinRival(ahora);
    return alertas ? `${alertas} alerta(s) sin rival` : undefined;
  },
};
