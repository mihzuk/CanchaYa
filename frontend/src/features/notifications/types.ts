import type { NivelEquipo } from '../teams/types';

export type ReferenciaTipo = 'reserva' | 'partido' | 'equipo' | 'complejo';

export interface Notificacion {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  referenciaTipo: ReferenciaTipo | null;
  referenciaId: number | null;
  fecha: string;
}

export interface PaginaNotificaciones {
  notificaciones: Notificacion[];
  noLeidas: number;
}

export type TipoFutbolAlerta = 5 | 6 | 7 | 8 | 11;

export interface PreferenciaAlerta {
  id: number;
  equipoId: number | null;
  /** 1 = lunes ... 7 = domingo. */
  dias: number[];
  horaInicio: string;
  horaFin: string;
  zona: string | null;
  nivel: NivelEquipo | null;
  tipoFutbol: TipoFutbolAlerta | null;
  activa: boolean;
}

export interface PreferenciaAlertaInput {
  equipoId: number | null;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  zona?: string;
  nivel: NivelEquipo | null;
  tipoFutbol: TipoFutbolAlerta | null;
  activa: boolean;
}

/** Ruta de la app a la que lleva una notificación según su referencia. */
export function rutaDeNotificacion(n: Pick<Notificacion, 'referenciaTipo' | 'referenciaId'>): string | null {
  if (!n.referenciaTipo) return null;
  switch (n.referenciaTipo) {
    case 'reserva':
      return n.referenciaId ? `/reservas/${n.referenciaId}` : '/mis-reservas';
    case 'partido':
      return n.referenciaId ? `/partidos/${n.referenciaId}` : '/partidos';
    case 'equipo':
      return n.referenciaId ? `/equipos/${n.referenciaId}` : '/mis-equipos';
    case 'complejo':
      return '/mis-complejos';
  }
}
