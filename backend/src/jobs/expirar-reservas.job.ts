import { bookingsApi } from '../modules/bookings';
import type { Tarea } from './tarea';

/** Cada minuto: las reservas sin pago vencidas pasan a "Expirada" y liberan la franja (RN-02, HT-06.1). */
export const expirarReservasJob: Tarea = {
  nombre: 'expirar-reservas',
  intervaloMs: 60_000,
  ejecutar: async (ahora) => {
    const n = await bookingsApi.expirarVencidas(ahora);
    return n ? `${n} reserva(s) expirada(s)` : undefined;
  },
};
