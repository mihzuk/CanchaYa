import { z } from 'zod';
import { zId, zTexto, zTipoFutbol, zUrlHttps } from '../../shared/http/validar';

export const NIVELES = ['principiante', 'intermedio', 'avanzado'] as const;
export type NivelEquipo = (typeof NIVELES)[number];
const zNivel = z.enum(NIVELES, { errorMap: () => ({ message: 'Elige un nivel válido' }) });

// HU-19
export const crearEquipoSchema = z.object({
  nombre: zTexto(60, 'El nombre del equipo').refine((n) => n.length >= 3, 'El nombre debe tener al menos 3 caracteres'),
  escudoUrl: zUrlHttps.nullable().default(null),
  nivel: zNivel,
  tipoFutbol: zTipoFutbol,
});
export type CrearEquipoDto = z.infer<typeof crearEquipoSchema>;

export const actualizarEquipoSchema = z.object({ escudoUrl: zUrlHttps.nullable().default(null), nivel: zNivel });
export type ActualizarEquipoDto = z.infer<typeof actualizarEquipoSchema>;

// HU-20
export const invitarUsuarioSchema = z.object({ username: z.string().trim().min(3).max(30) });
export const respuestaSchema = z.object({ aceptar: z.boolean({ required_error: 'Indica si aceptas' }) });
export const tokenParamSchema = z.object({ token: z.string().min(10).max(200) });

// HU-21
export const miembroParamsSchema = z.object({ id: zId, usuarioId: zId });
export const invitacionParamsSchema = z.object({ id: zId, invitacionId: zId });
export const cederCapitaniaSchema = z.object({ usuarioId: zId });

// --- Salida -----------------------------------------------------------------------------------

export interface EquipoDto {
  id: number;
  nombre: string;
  escudoUrl: string | null;
  nivel: NivelEquipo;
  tipoFutbol: number;
  estado: 'activo' | 'inactivo';
  capitanId: number;
  capitanPropuestoId: number | null;
  inasistencias: number;
  suspendidoHasta: string | null;
  fechaCreacion: string;
  totalMiembros: number;
}

/** Sin correo ni celular (HU-04). */
export interface MiembroDto {
  usuarioId: number;
  username: string | null;
  nombre: string | null;
  fotoUrl: string | null;
  rolEnEquipo: 'capitan' | 'miembro';
  fechaIngreso: string;
}

export interface InvitacionDto {
  id: number;
  equipo: { id: number; nombre: string; escudoUrl: string | null; nivel: NivelEquipo; tipoFutbol: number };
  usuarioInvitado: { id: number; username: string | null; nombre: string | null } | null;
  porEnlace: boolean;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  fecha: string;
}
