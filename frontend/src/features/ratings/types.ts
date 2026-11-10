export interface ResumenCalificacion {
  promedio: number;
  total: number;
}

export interface CalificacionReserva {
  id: number;
  reservaId?: number;
  complejoId?: number;
  estrellas: number;
  comentario: string | null;
  fecha: string;
}

export interface ResenaComplejo {
  id: number;
  complejoId: number;
  estrellas: number;
  comentario: string | null;
  fecha: string;
}

export interface PaginaResenas {
  resumen: ResumenCalificacion | null;
  calificaciones: ResenaComplejo[];
}

export type CalificacionEquipoInput =
  | { noSePresento: false; equipoId: number; puntualidad: number; fairPlay: number; comentario?: string }
  | { noSePresento: true; equipoId: number; comentario?: string };

export interface ReporteInasistencia {
  id: number;
  partidoId: number;
  equipoCalificadorId: number;
  equipoCalificadoId: number;
  comentario: string | null;
  fecha: string;
}

export function textoPromedio(r: ResumenCalificacion | null | undefined): string {
  if (!r || r.total === 0) return 'Sin calificaciones';
  return `${r.promedio.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} de 5 (${r.total} ${r.total === 1 ? 'calificación' : 'calificaciones'})`;
}
