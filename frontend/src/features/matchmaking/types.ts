import type { NivelEquipo } from '../teams/types';

export type Modalidad = 'busco_rival' | 'faltan_jugadores' | 'busco_partido_sin_cancha';
export type EstadoPartido = 'buscando' | 'rival_confirmado' | 'completo' | 'cancelado' | 'jugado';
export type PosicionJugador = 'arquero' | 'defensa' | 'medio' | 'delantero';

export const MODALIDADES: { valor: Modalidad; etiqueta: string; ayuda: string }[] = [
  { valor: 'busco_rival', etiqueta: 'Busco rival', ayuda: 'Tienes cancha reservada y buscas un equipo para jugar contra ti.' },
  { valor: 'faltan_jugadores', etiqueta: 'Faltan jugadores', ayuda: 'Tienes cancha reservada y te faltan jugadores para completar tu equipo.' },
  { valor: 'busco_partido_sin_cancha', etiqueta: 'Busco partido sin cancha', ayuda: 'Quieres jugar y todavía no tienes cancha: otro equipo la aporta.' },
];

export const POSICIONES: { valor: PosicionJugador; etiqueta: string }[] = [
  { valor: 'arquero', etiqueta: 'Arquero' },
  { valor: 'defensa', etiqueta: 'Defensa' },
  { valor: 'medio', etiqueta: 'Medio' },
  { valor: 'delantero', etiqueta: 'Delantero' },
];

export function etiquetaModalidad(m: Modalidad): string {
  return MODALIDADES.find((x) => x.valor === m)?.etiqueta ?? m;
}

export const ETIQUETA_ESTADO: Record<EstadoPartido, string> = {
  buscando: 'Buscando',
  rival_confirmado: 'Rival confirmado',
  completo: 'Completo',
  cancelado: 'Cancelado',
  jugado: 'Jugado',
};

export interface EquipoResumen {
  id: number;
  nombre: string;
  escudoUrl: string | null;
  nivel: string;
  tipoFutbol: number;
  fairPlay: number | null;
}

export interface ReservaPartido {
  id: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  tipoFutbol: number;
  cancha: string;
  complejo: { id: number; nombre: string; ciudad: string; barrio: string; direccion: string };
  precioTotal: number;
}

export interface Partido {
  id: number;
  modalidad: Modalidad;
  estado: EstadoPartido;
  nivelBuscado: string;
  descripcion: string | null;
  aceptacionAutomatica: boolean;
  porcentajePagoRival: number;
  cuposDisponibles: number | null;
  aportePorJugador: number | null;
  posicionDeseada: PosicionJugador | null;
  fechaPreferida: string | null;
  rangoHoraInicio: string | null;
  rangoHoraFin: string | null;
  zona: string | null;
  fechaPublicacion: string;
  equipoPublicador: EquipoResumen;
  equipoRival: EquipoResumen | null;
  reserva: ReservaPartido | null;
  valorPorEquipo: { publicador: number; rival: number } | null;
}

export interface UltimoResultado {
  partidoId: number;
  golesPropios: number;
  golesRival: number;
  fecha: string;
}

export interface DetallePartido {
  partido: Partido;
  ultimosResultados: UltimoResultado[];
  esCapitanPublicador: boolean;
  miPostulacion: { id: number; equipoId: number; estado: 'pendiente' | 'aceptada' | 'rechazada' } | null;
  miInscripcion: { id: number; estado: 'pendiente' | 'aceptada' | 'rechazada'; posicion: string | null } | null;
}

export interface Postulacion {
  id: number;
  partidoId: number;
  equipo: EquipoResumen;
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'anulada';
  fecha: string;
}

export interface Inscripcion {
  id: number;
  partidoId: number;
  usuarioId: number;
  jugador: { username: string | null; nombre: string | null; fotoUrl: string | null };
  posicion: string | null;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  aporte?: number | null;
  fecha: string;
}

export interface FiltrosPartidos {
  fecha: string;
  horaDesde: string;
  horaHasta: string;
  ciudad: string;
  barrio: string;
  tipoFutbol: string;
  nivel: string;
  modalidad: string;
}

export type PublicarInput =
  | {
      modalidad: 'busco_rival';
      equipoId: number;
      reservaId: number;
      nivelBuscado: NivelEquipo;
      descripcion?: string;
      aceptacionAutomatica: boolean;
      porcentajePagoRival: number;
    }
  | {
      modalidad: 'faltan_jugadores';
      equipoId: number;
      reservaId: number;
      nivelBuscado: NivelEquipo;
      descripcion?: string;
      cuposDisponibles: number;
      aportePorJugador: number;
      posicionDeseada: PosicionJugador | null;
    }
  | {
      modalidad: 'busco_partido_sin_cancha';
      equipoId: number;
      nivelBuscado: NivelEquipo;
      descripcion?: string;
      fechaPreferida: string;
      rangoHoraInicio: string;
      rangoHoraFin: string;
      zona: string;
    };
