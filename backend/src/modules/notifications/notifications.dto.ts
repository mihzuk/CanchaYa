import { z } from 'zod';
import { zHora, zId, zTextoOpcional, zTipoFutbol } from '../../shared/http/validar';

export const listaSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(50).default(20),
});

// HU-29
export const preferenciaSchema = z
  .object({
    equipoId: zId.nullable().default(null),
    dias: z.array(z.number().int().min(1).max(7)).min(1, 'Elige al menos un día').max(7),
    horaInicio: zHora,
    horaFin: zHora,
    zona: zTextoOpcional(100),
    nivel: z.enum(['principiante', 'intermedio', 'avanzado']).nullable().default(null),
    tipoFutbol: zTipoFutbol.nullable().default(null),
    activa: z.boolean().default(true),
  })
  .refine((p) => p.horaInicio < p.horaFin, { message: 'La hora final debe ser posterior a la inicial', path: ['horaFin'] });
export type PreferenciaInput = z.infer<typeof preferenciaSchema>;

export interface NotificacionDto {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  referenciaTipo: string | null;
  referenciaId: number | null;
  fecha: string;
}

export interface PreferenciaDto {
  id: number;
  equipoId: number | null;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  zona: string | null;
  nivel: string | null;
  tipoFutbol: number | null;
  activa: boolean;
}
