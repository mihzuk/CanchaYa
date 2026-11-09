export type NivelEquipo = 'principiante' | 'intermedio' | 'avanzado';

export const NIVELES_EQUIPO: { valor: NivelEquipo; etiqueta: string }[] = [
  { valor: 'principiante', etiqueta: 'Principiante' },
  { valor: 'intermedio', etiqueta: 'Intermedio' },
  { valor: 'avanzado', etiqueta: 'Avanzado' },
];

export function etiquetaNivel(nivel: string): string {
  return NIVELES_EQUIPO.find((n) => n.valor === nivel)?.etiqueta ?? nivel;
}

export interface Equipo {
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

export interface Miembro {
  usuarioId: number;
  username: string | null;
  nombre: string | null;
  fotoUrl: string | null;
  rolEnEquipo: 'capitan' | 'miembro';
  fechaIngreso: string;
}

export interface DetalleEquipo {
  equipo: Equipo;
  miembros: Miembro[];
  esMiembro: boolean;
  esCapitan: boolean;
}

export interface Invitacion {
  id: number;
  equipo: { id: number; nombre: string; escudoUrl: string | null; nivel: NivelEquipo; tipoFutbol: number };
  usuarioInvitado: { id: number; username: string | null; nombre: string | null } | null;
  porEnlace: boolean;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  fecha: string;
}

export interface CrearEquipoInput {
  nombre: string;
  nivel: NivelEquipo;
  tipoFutbol: number;
  escudoUrl: string | null;
}

export interface EnlaceEquipo {
  token: string;
  validoPorDias: number;
}

export interface VistaEnlace {
  equipo: { id: number; nombre: string; escudoUrl: string | null; nivel: NivelEquipo; tipoFutbol: number; totalMiembros: number };
}
