import { z } from 'zod';
import { zDinero, zFecha, zHora, zId, zTextoOpcional } from '../../shared/http/validar';

export type MetodoPago = 'tarjeta' | 'pse' | 'nequi' | 'efectivo' | 'transferencia';
export type TipoPago = 'abono' | 'saldo' | 'aporte_jugador';
export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'reembolsado';

// HU-16: abono en línea (pasarela simulada, HT-08)
export const pagoEnLineaSchema = z.object({
  metodo: z.enum(['tarjeta', 'pse', 'nequi'], { errorMap: () => ({ message: 'Elige tarjeta, PSE o Nequi' }) }),
  /** Por defecto el abono requerido (mínimo, RN-03); se puede pagar más, hasta el total de la reserva. */
  valor: zDinero.optional(),
  // Datos que entregaría el formulario de la pasarela. En la simulada: número de tarjeta (solo se usan los últimos dígitos).
  datos: z
    .object({
      numeroTarjeta: z.string().trim().regex(/^[\d ]{12,23}$/, 'Número de tarjeta inválido').optional(),
      resultado: z.enum(['aprobado', 'rechazado']).optional(),
    })
    .strict()
    .optional(),
});
export type PagoEnLineaDto = z.infer<typeof pagoEnLineaSchema>;

// HU-17: pago registrado por el administrador en el complejo
export const pagoManualSchema = z.object({
  tipo: z.enum(['abono', 'saldo']).default('saldo'),
  metodo: z.enum(['efectivo', 'transferencia'], { errorMap: () => ({ message: 'Elige efectivo o transferencia' }) }),
  /** Por defecto: todo el saldo (saldo) o el abono requerido (abono). */
  valor: zDinero.optional(),
  referencia: zTextoOpcional(80),
});
export type PagoManualDto = z.infer<typeof pagoManualSchema>;

// HU-12
export const cancelacionSchema = z.object({ motivo: zTextoOpcional(255) });
export const reprogramacionSchema = z.object({ fecha: zFecha, horaInicio: zHora, canchaId: zId.optional() });
export type ReprogramacionDto = z.infer<typeof reprogramacionSchema>;

// HU-18
export const filtroReembolsosSchema = z.object({ estado: z.enum(['pendiente', 'reembolsado']).optional() });
export const rangoPagosSchema = z
  .object({ desde: zFecha.optional(), hasta: zFecha.optional() })
  .refine((r) => !r.desde || !r.hasta || r.desde <= r.hasta, { message: 'La fecha final debe ser igual o posterior a la inicial', path: ['hasta'] });

// --- Salida -----------------------------------------------------------------------------------

export interface PagoDto {
  id: number;
  reservaId: number;
  usuarioId: number | null;
  equipoId: number | null;
  valor: number;
  tipo: TipoPago;
  metodo: MetodoPago;
  referencia: string | null;
  estado: EstadoPago;
  fecha: string;
}

export interface ReembolsoDto {
  id: number;
  pagoId: number;
  reservaId: number;
  valor: number;
  porcentaje: number;
  motivo: string;
  estado: 'pendiente' | 'reembolsado';
  fechaSolicitud: string;
  fechaResolucion: string | null;
}

export interface PreviewCancelacionDto {
  horasDeAnticipacion: number;
  porcentajeReembolso: number;
  totalPagado: number;
  valorReembolso: number;
  puedeReprogramar: boolean;
}
