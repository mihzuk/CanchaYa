import { z } from 'zod';
import { zCelular, zFecha, zHora, zId, zTexto, zTipoFutbol } from '../../shared/http/validar';
import type { EstadoReserva } from './domain/booking-rules';
import type { EstadoDisponibilidad } from './domain/availability';

// HU-10
export const busquedaSchema = z
  .object({
    fecha: zFecha,
    ciudad: z.string().trim().max(80).optional(),
    barrio: z.string().trim().max(80).optional(),
    tipoFutbol: zTipoFutbol.optional(),
    horaDesde: zHora.optional(),
    horaHasta: zHora.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((b) => !b.horaDesde || !b.horaHasta || b.horaDesde < b.horaHasta, {
    message: 'La hora final debe ser posterior a la inicial',
    path: ['horaHasta'],
  })
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: 'Envía latitud y longitud juntas', path: ['lng'] });
export type BusquedaDto = z.infer<typeof busquedaSchema>;

export const fechaQuerySchema = z.object({ fecha: zFecha });

// HU-11
export const crearReservaSchema = z.object({
  canchaId: zId,
  fecha: zFecha,
  horaInicio: zHora,
});
export type CrearReservaDto = z.infer<typeof crearReservaSchema>;

// HU-13
export const misReservasSchema = z.object({ vista: z.enum(['proximas', 'historial']).default('proximas') });

// HU-14
export const reservaManualSchema = crearReservaSchema.extend({
  nombreCliente: zTexto(120, 'El nombre del cliente'),
  celularCliente: zCelular,
});
export type ReservaManualDto = z.infer<typeof reservaManualSchema>;

export const cambioEstadoSchema = z.object({
  estado: z.enum(['completada', 'no_asistio'], { errorMap: () => ({ message: 'El estado debe ser completada o no_asistio' }) }),
});

// --- Salida -----------------------------------------------------------------------------------

export interface ReservaDto {
  id: number;
  codigo: string;
  usuarioId: number | null;
  canchaId: number;
  cancha: { nombre: string; tipoFutbol: number };
  complejo: { id: number; nombre: string; direccion: string; ciudad: string; barrio: string };
  fecha: string;
  horaInicio: string;
  horaFin: string;
  precioTotal: number;
  abonoRequerido: number;
  saldoPendiente: number;
  /** precioTotal − saldoPendiente */
  totalPagado: number;
  estado: EstadoReserva;
  origen: 'web' | 'manual';
  nombreClienteManual: string | null;
  celularClienteManual: string | null;
  reprogramadaDeId: number | null;
  motivoCancelacion: string | null;
  fechaCreacion: string;
  fechaExpiracion: string | null;
  fechaCancelacion: string | null;
  /** Segundos que quedan para pagar el abono (solo pendiente_pago). */
  segundosParaPagar: number;
}

export interface FranjaDisponibleDto {
  horaInicio: string;
  horaFin: string;
  precio: number | null;
  estado: EstadoDisponibilidad;
}

export interface ResultadoBusquedaDto {
  complejo: {
    id: number;
    nombre: string;
    ciudad: string;
    barrio: string;
    direccion: string;
    fotoPrincipal: string | null;
    distanciaKm: number | null;
    /** HU-30.3 */
    calificacion: { promedio: number; total: number } | null;
  };
  canchas: {
    id: number;
    nombre: string;
    tipoFutbol: number;
    techada: boolean;
    iluminacion: boolean;
    franjas: FranjaDisponibleDto[];
  }[];
  precioDesde: number | null;
}
