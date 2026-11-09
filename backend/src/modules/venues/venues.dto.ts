import { z } from 'zod';
import {
  zCelular,
  zDinero,
  zFecha,
  zHora,
  zId,
  zTexto,
  zTextoOpcional,
  zTipoFutbol,
  zUrlHttps,
} from '../../shared/http/validar';
import { esFechaValida, esHoraValida } from '../../shared/utils/time';
import type { TipoDia } from './domain/rates';

// --- Complejo (HU-05) -------------------------------------------------------------------------

export const complejoSchema = z.object({
  nombre: zTexto(120, 'El nombre'),
  descripcion: zTextoOpcional(2000),
  direccion: zTexto(200, 'La dirección'),
  ciudad: zTexto(80, 'La ciudad'),
  barrio: zTexto(80, 'El barrio'),
  telefono: zCelular,
  latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
  // RN-03: 50 % por defecto, configurable por el complejo.
  porcentajeAbono: z.coerce.number().min(10, 'El abono mínimo es 10 %').max(100, 'El abono máximo es 100 %').default(50),
  servicioIds: z.array(zId).max(20).default([]),
});
export type ComplejoInput = z.infer<typeof complejoSchema>;

export const filtrosComplejosSchema = z.object({
  ciudad: z.string().trim().max(80).optional(),
  q: z.string().trim().max(80).optional(),
  tipoFutbol: zTipoFutbol.optional(),
  servicio: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(50).default(12),
});
export type FiltrosComplejos = z.infer<typeof filtrosComplejosSchema>;

export const aprobacionSchema = z
  .object({
    aprobar: z.boolean({ required_error: 'Indica si apruebas el complejo' }),
    motivo: zTextoOpcional(255),
  })
  .refine((d) => d.aprobar || !!d.motivo, { message: 'Indica el motivo del rechazo', path: ['motivo'] });

export const fotoSchema = z.object({ url: zUrlHttps });
export const serviciosSchema = z.object({ servicioIds: z.array(zId).max(20) });

// --- Cancha (HU-06) ---------------------------------------------------------------------------

export const canchaSchema = z.object({
  nombre: zTexto(60, 'El nombre de la cancha'),
  tipoFutbol: zTipoFutbol,
  superficie: zTexto(40, 'La superficie'),
  techada: z.boolean().default(false),
  iluminacion: z.boolean().default(false),
  capacidadJugadores: z.coerce.number().int().min(2).max(40).optional(),
  estado: z.enum(['activa', 'inactiva']).default('activa'),
});
export type CanchaInput = z.infer<typeof canchaSchema>;

// --- Horarios (HU-07) -------------------------------------------------------------------------

const zDuracion = z.coerce
  .number()
  .int()
  .min(30, 'El turno mínimo es de 30 minutos')
  .max(180, 'El turno máximo es de 180 minutos');

export const horarioHabitualSchema = z.object({
  dias: z
    .array(
      z.object({
        diaSemana: z.coerce.number().int().min(1).max(7),
        horaApertura: zHora,
        horaCierre: zHora,
        duracionTurnoMin: zDuracion,
      }),
    )
    .max(7)
    .refine((d) => new Set(d.map((x) => x.diaSemana)).size === d.length, 'Cada día de la semana puede aparecer una sola vez'),
});

/** Fecha especial: otro horario ese día, o `cerrado: true` (sin horas) para no abrir. */
const horarioEspecialBase = z.discriminatedUnion('cerrado', [
  z.object({ fecha: zFecha, cerrado: z.literal(true) }),
  z.object({
    fecha: zFecha,
    cerrado: z.literal(false),
    horaApertura: zHora,
    horaCierre: zHora,
    duracionTurnoMin: zDuracion,
  }),
]);
// Si no se envía `cerrado`, es un horario especial abierto.
export const horarioEspecialSchema = z.preprocess(
  (v) => (v && typeof v === 'object' && !('cerrado' in v) ? { ...v, cerrado: false } : v),
  horarioEspecialBase,
);
export type HorarioEspecialInput = z.infer<typeof horarioEspecialBase>;

export const fechaParamSchema = z.object({ id: zId, fecha: zFecha });

// --- Tarifas (HU-08) --------------------------------------------------------------------------

export const tarifaSchema = z.object({
  tipoDia: z.enum(['semana', 'fin_semana_festivo'], { errorMap: () => ({ message: 'Elige semana o fin de semana y festivo' }) }),
  horaInicio: zHora,
  horaFin: zHora,
  precio: zDinero,
});
export type TarifaInput = z.infer<typeof tarifaSchema>;

// --- Bloqueos (HU-09) -------------------------------------------------------------------------

/** Fecha y hora local de Bogotá: 'YYYY-MM-DDTHH:MM'. */
const zFechaHora = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/, 'Usa el formato AAAA-MM-DDTHH:MM')
  .refine((v) => esFechaValida(v.slice(0, 10)) && esHoraValida(v.slice(11, 16)), 'Fecha u hora inválida')
  .transform((v) => ({ fecha: v.slice(0, 10), hora: v.slice(11, 16) }));

export const bloqueoSchema = z.object({
  fechaInicio: zFechaHora,
  fechaFin: zFechaHora,
  motivo: zTexto(150, 'El motivo'),
});
export type BloqueoInput = z.infer<typeof bloqueoSchema>;

export const rangoFechasSchema = z
  .object({ desde: zFecha.optional(), hasta: zFecha.optional() })
  .refine((r) => !r.desde || !r.hasta || r.desde <= r.hasta, {
    message: 'La fecha final debe ser igual o posterior a la inicial',
    path: ['hasta'],
  });
export const franjasQuerySchema = z.object({ fecha: zFecha });

// --- Salida -----------------------------------------------------------------------------------

export type EstadoComplejo = 'pendiente' | 'activo' | 'rechazado';

export interface ServicioDto {
  id: number;
  nombre: string;
}

export interface FotoDto {
  id: number;
  url: string;
  orden: number;
}

export interface ComplejoDto {
  id: number;
  adminId: number;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  ciudad: string;
  barrio: string;
  telefono: string;
  latitud: number | null;
  longitud: number | null;
  porcentajeAbono: number;
  estado: EstadoComplejo;
  motivoRechazo: string | null;
  fechaCreacion: string;
  servicios: ServicioDto[];
  fotos: FotoDto[];
}

export interface ComplejoResumenDto {
  id: number;
  nombre: string;
  direccion: string;
  ciudad: string;
  barrio: string;
  estado: EstadoComplejo;
  motivoRechazo: string | null;
  fechaCreacion: string;
  fotoPrincipal: string | null;
  servicios: string[];
  tiposFutbol: number[];
  canchasActivas: number;
  precioDesde: number | null;
}

export interface CanchaDto {
  id: number;
  complejoId: number;
  nombre: string;
  tipoFutbol: number;
  superficie: string;
  techada: boolean;
  iluminacion: boolean;
  capacidadJugadores: number;
  estado: 'activa' | 'inactiva';
}

export interface HorarioDto {
  id: number;
  diaSemana: number | null;
  fechaEspecial: string | null;
  /** Solo en fechas especiales: el complejo no abre ese día (sin horas ni turnos). */
  cerrado: boolean;
  horaApertura: string | null;
  horaCierre: string | null;
  duracionTurnoMin: number | null;
}

export interface TarifaDto {
  id: number;
  canchaId: number;
  tipoDia: TipoDia;
  horaInicio: string;
  horaFin: string;
  precio: number;
  activa: boolean;
}

export interface BloqueoDto {
  id: number;
  canchaId: number;
  fechaInicio: string; // 'YYYY-MM-DDTHH:MM' hora de Bogotá
  fechaFin: string;
  motivo: string;
}

export type EstadoFranja = 'libre' | 'bloqueada' | 'pasada' | 'sin_tarifa';

export interface FranjaDto {
  horaInicio: string;
  horaFin: string;
  precio: number | null;
  estado: EstadoFranja;
}

/** Cancha con los datos de su complejo, para la búsqueda de disponibilidad (HU-10). */
export interface CanchaBusquedaDto extends CanchaDto {
  complejo: {
    id: number;
    nombre: string;
    ciudad: string;
    barrio: string;
    direccion: string;
    latitud: number | null;
    longitud: number | null;
    porcentajeAbono: number;
    fotoPrincipal: string | null;
  };
}

/** Reserva activa vista desde venues (la provee bookings; ver `registrarConsultaReservas`). */
export interface ReservaActivaDto {
  id: number;
  codigo: string;
  canchaId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}
