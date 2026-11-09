/** RN-08: un equipo suspendido no puede publicar ni postularse a Busca Partido. */
export function estaSuspendido(suspendidoHasta: string | Date | null, ahora: Date): boolean {
  return suspendidoHasta !== null && new Date(suspendidoHasta).getTime() > ahora.getTime();
}

/** RN-08: 3 inasistencias (por defecto) dentro de los últimos 60 días suspenden al equipo. */
export function debeSuspenderse(fechasInasistencia: readonly Date[], ahora: Date, umbral = 3, ventanaDias = 60): boolean {
  const desde = ahora.getTime() - ventanaDias * 86_400_000;
  return fechasInasistencia.filter((f) => f.getTime() >= desde && f.getTime() <= ahora.getTime()).length >= umbral;
}

export function finDeSuspension(ahora: Date, dias = 15): Date {
  return new Date(ahora.getTime() + dias * 86_400_000);
}
