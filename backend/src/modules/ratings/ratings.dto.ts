import { z } from 'zod';
import { zId, zTextoOpcional } from '../../shared/http/validar';

const zPuntaje = z.number({ invalid_type_error: 'Debe ser un número' }).int().min(1, 'Mínimo 1').max(5, 'Máximo 5');

// HU-30
export const calificarComplejoSchema = z.object({ estrellas: zPuntaje, comentario: zTextoOpcional(500) });

// HU-31
export const calificarEquipoSchema = z.discriminatedUnion('noSePresento', [
  z.object({ noSePresento: z.literal(false), equipoId: zId, puntualidad: zPuntaje, fairPlay: zPuntaje, comentario: zTextoOpcional(500) }),
  z.object({ noSePresento: z.literal(true), equipoId: zId, comentario: zTextoOpcional(500) }),
]);
export type CalificarEquipoDto = z.infer<typeof calificarEquipoSchema>;

export const paginaSchema = z.object({ pagina: z.coerce.number().int().min(1).default(1), tamano: z.coerce.number().int().min(1).max(50).default(10) });

export interface CalificacionComplejoDto {
  id: number;
  reservaId: number;
  usuarioId: number;
  complejoId: number;
  estrellas: number;
  comentario: string | null;
  fecha: string;
}

export interface CalificacionEquipoDto {
  id: number;
  partidoId: number;
  equipoCalificadorId: number;
  equipoCalificadoId: number;
  puntualidad: number | null;
  fairPlay: number | null;
  noSePresento: boolean;
  confirmadoPorAdmin: boolean;
  comentario: string | null;
  fecha: string;
}
