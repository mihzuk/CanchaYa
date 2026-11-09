import { z } from 'zod';
import { zFecha, zHora, zId, zTexto, zTextoOpcional, zTipoFutbol } from '../../shared/http/validar';

const NIVELES = ['principiante', 'intermedio', 'avanzado'] as const;
const zNivel = z.enum(NIVELES, { errorMap: () => ({ message: 'Elige un nivel válido' }) });
const POSICIONES = ['arquero', 'defensa', 'medio', 'delantero'] as const;

export type ModalidadPartido = 'busco_rival' | 'faltan_jugadores' | 'busco_partido_sin_cancha';
export type EstadoPartido = 'buscando' | 'rival_confirmado' | 'completo' | 'cancelado' | 'jugado';

const base = { equipoId: zId, nivelBuscado: zNivel, descripcion: zTextoOpcional(255) };

// HU-22 y HU-25
export const publicarSchema = z.discriminatedUnion('modalidad', [
  z.object({
    modalidad: z.literal('busco_rival'),
    reservaId: zId,
    ...base,
    aceptacionAutomatica: z.boolean().default(false),
    porcentajePagoRival: z.number({ invalid_type_error: 'Debe ser un número' }).min(0).max(100).default(50),
  }),
  z.object({
    modalidad: z.literal('faltan_jugadores'),
    reservaId: zId,
    ...base,
    cuposDisponibles: z.number({ invalid_type_error: 'Debe ser un número' }).int().min(1, 'Debe haber al menos un cupo'),
    aportePorJugador: z.number({ invalid_type_error: 'Debe ser un número' }).int().min(0).max(1_000_000).default(0),
    // HU-25.1
    posicionDeseada: z.enum(POSICIONES).nullable().default(null),
  }),
  z.object({
    modalidad: z.literal('busco_partido_sin_cancha'),
    ...base,
    fechaPreferida: zFecha,
    rangoHoraInicio: zHora,
    rangoHoraFin: zHora,
    zona: zTexto(100, 'La zona'),
  }),
]);
export type PublicarDto = z.infer<typeof publicarSchema>;

// HU-23
export const filtrosPartidosSchema = z
  .object({
    fecha: zFecha.optional(),
    horaDesde: zHora.optional(),
    horaHasta: zHora.optional(),
    ciudad: z.string().trim().max(80).optional(),
    barrio: z.string().trim().max(80).optional(),
    tipoFutbol: zTipoFutbol.optional(),
    nivel: zNivel.optional(),
    modalidad: z.enum(['busco_rival', 'faltan_jugadores', 'busco_partido_sin_cancha']).optional(),
  })
  .refine((f) => !f.horaDesde || !f.horaHasta || f.horaDesde < f.horaHasta, { message: 'La hora final debe ser posterior a la inicial', path: ['horaHasta'] });
export type FiltrosPartidos = z.infer<typeof filtrosPartidosSchema>;

export const postularSchema = z.object({ equipoId: zId });
export const aceptarConReservaSchema = z.object({ equipoId: zId, reservaId: zId });
export const inscribirSchema = z.object({ posicion: z.enum(POSICIONES).nullable().default(null) });
export const respuestaSchema = z.object({ aceptar: z.boolean({ required_error: 'Indica si aceptas' }) });

// --- Salida -----------------------------------------------------------------------------------

export interface EquipoResumenDto {
  id: number;
  nombre: string;
  escudoUrl: string | null;
  nivel: string;
  tipoFutbol: number;
  fairPlay: number | null;
}

export interface PartidoDto {
  id: number;
  modalidad: ModalidadPartido;
  estado: EstadoPartido;
  nivelBuscado: string;
  descripcion: string | null;
  aceptacionAutomatica: boolean;
  porcentajePagoRival: number;
  cuposDisponibles: number | null;
  aportePorJugador: number | null;
  posicionDeseada: string | null;
  fechaPreferida: string | null;
  rangoHoraInicio: string | null;
  rangoHoraFin: string | null;
  zona: string | null;
  fechaPublicacion: string;
  equipoPublicador: EquipoResumenDto;
  equipoRival: EquipoResumenDto | null;
  reserva: {
    id: number;
    fecha: string;
    horaInicio: string;
    horaFin: string;
    tipoFutbol: number;
    cancha: string;
    complejo: { id: number; nombre: string; ciudad: string; barrio: string; direccion: string };
    precioTotal: number;
  } | null;
  /** HU-22.2: valor a pagar por cada equipo. */
  valorPorEquipo: { publicador: number; rival: number } | null;
}

export interface PostulacionDto {
  id: number;
  partidoId: number;
  equipo: EquipoResumenDto;
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'anulada';
  fecha: string;
}

export interface InscripcionDto {
  id: number;
  partidoId: number;
  usuarioId: number;
  jugador: { username: string | null; nombre: string | null; fotoUrl: string | null };
  posicion: string | null;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  fecha: string;
}
