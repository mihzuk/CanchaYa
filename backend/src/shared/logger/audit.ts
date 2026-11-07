import { logger } from './logger';

/**
 * Registro de auditoría de acciones críticas (HT-14): reservas, pagos, cancelaciones, aprobaciones.
 * Se escribe como evento estructurado `auditoria` para poder filtrarlo en el agregador de logs.
 */
export type AccionAuditada =
  | 'usuario.registro'
  | 'usuario.login'
  | 'usuario.bloqueo'
  | 'usuario.contrasena_restablecida'
  | 'complejo.creado'
  | 'complejo.aprobado'
  | 'complejo.rechazado'
  | 'reserva.creada'
  | 'reserva.cancelada'
  | 'reserva.reprogramada'
  | 'reserva.estado'
  | 'pago.registrado'
  | 'reembolso.creado'
  | 'reembolso.resuelto'
  | 'usuario.estado'
  | 'parametro.actualizado';

export function auditar(
  accion: AccionAuditada,
  datos: { usuarioId?: number | null; entidad?: string; entidadId?: number | string; [k: string]: unknown },
): void {
  logger.info('auditoria', { accion, ...datos });
}
