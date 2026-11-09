/**
 * RN-02: una reserva sin pago queda retenida máximo N minutos (15 por defecto); después pasa a
 * "Expirada" y libera la franja.
 */
export function fechaDeExpiracion(creacion: Date, minutosRetencion: number): Date {
  if (!Number.isFinite(minutosRetencion) || minutosRetencion <= 0) throw new Error('La retención debe ser positiva');
  return new Date(creacion.getTime() + minutosRetencion * 60_000);
}

export function estaVencida(reserva: { estado: string; fechaExpiracion: Date | null }, ahora: Date): boolean {
  return reserva.estado === 'pendiente_pago' && reserva.fechaExpiracion !== null && reserva.fechaExpiracion <= ahora;
}

/** Segundos que le quedan al jugador para pagar (0 si ya venció). */
export function segundosRestantes(fechaExpiracion: Date | null, ahora: Date): number {
  if (!fechaExpiracion) return 0;
  return Math.max(0, Math.floor((fechaExpiracion.getTime() - ahora.getTime()) / 1000));
}
