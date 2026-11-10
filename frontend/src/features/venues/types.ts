import type { ResumenCalificacion } from '../ratings/types';

export interface Servicio {
  id: number;
  nombre: string;
}
export interface Foto {
  id: number;
  url: string;
  orden: number;
}
export type EstadoComplejo = 'pendiente' | 'activo' | 'rechazado';
export interface Complejo {
  id: number;
  adminId: number;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  ciudad: string;
  barrio: string;
  telefono: string;
  latitud: number | null;
  longitud: number | null;
  porcentajeAbono: number;
  estado: EstadoComplejo;
  motivoRechazo: string | null;
  fechaCreacion: string;
  servicios: Servicio[];
  fotos: Foto[];
}
export interface ComplejoResumen {
  id: number;
  nombre: string;
  direccion: string;
  ciudad: string;
  barrio: string;
  estado: EstadoComplejo;
  motivoRechazo?: string | null;
  fotoPrincipal: string | null;
  servicios: string[];
  tiposFutbol: number[];
  canchasActivas: number;
  precioDesde: number | null;
  calificacion?: ResumenCalificacion | null;
}
export type TipoFutbol = 5 | 6 | 7 | 8 | 11;
export const TIPOS_FUTBOL: TipoFutbol[] = [5, 6, 7, 8, 11];
export interface Cancha {
  id: number;
  complejoId: number;
  nombre: string;
  tipoFutbol: TipoFutbol;
  superficie: string;
  techada: boolean;
  iluminacion: boolean;
  capacidadJugadores: number;
  estado: 'activa' | 'inactiva';
}
export interface Horario {
  id: number;
  diaSemana: number | null;
  fechaEspecial: string | null;
  /** Solo en fechas especiales: el complejo no abre ese día (sin horas). */
  cerrado: boolean;
  horaApertura: string | null;
  horaCierre: string | null;
  duracionTurnoMin: number | null;
}
export type TipoDia = 'semana' | 'fin_semana_festivo';
export interface Tarifa {
  id: number;
  canchaId: number;
  tipoDia: TipoDia;
  horaInicio: string;
  horaFin: string;
  precio: number;
  activa: boolean;
}
export interface Bloqueo {
  id: number;
  canchaId: number;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
}
export type EstadoFranja = 'libre' | 'bloqueada' | 'pasada' | 'sin_tarifa' | 'reservada' | 'partido_abierto';
export interface Franja {
  horaInicio: string;
  horaFin: string;
  precio: number | null;
  estado: EstadoFranja;
}
export interface ReservaActiva {
  id: number;
  codigo: string;
  canchaId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

export interface ComplejoInput {
  nombre: string;
  descripcion?: string;
  direccion: string;
  ciudad: string;
  barrio: string;
  telefono: string;
  latitud?: number | null;
  longitud?: number | null;
  porcentajeAbono: number;
  servicioIds: number[];
}
export interface CanchaInput {
  nombre: string;
  tipoFutbol: TipoFutbol;
  superficie: string;
  techada: boolean;
  iluminacion: boolean;
  capacidadJugadores?: number;
  estado: 'activa' | 'inactiva';
}
export interface TarifaInput {
  tipoDia: TipoDia;
  horaInicio: string;
  horaFin: string;
  precio: number;
}
export interface BloqueoInput {
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
}
export interface DiaHorario {
  diaSemana: number;
  horaApertura: string;
  horaCierre: string;
  duracionTurnoMin: number;
}
export type HorarioEspecialInput =
  | { fecha: string; cerrado: true }
  | { fecha: string; cerrado: false; horaApertura: string; horaCierre: string; duracionTurnoMin: number };
export interface ResultadoHorarios {
  horarios: Horario[];
  advertencias: { reservasFueraDeHorario: ReservaActiva[] };
}
export interface FiltrosComplejos {
  ciudad?: string;
  q?: string;
  tipoFutbol?: string;
  servicio?: string;
  pagina?: number;
  tamano?: number;
}
export interface PaginaComplejos {
  complejos: ComplejoResumen[];
  total: number;
  pagina: number;
  tamano: number;
}
export interface DetalleComplejo {
  complejo: Complejo;
  canchas: Cancha[];
  horarios: Horario[];
  esGestor: boolean;
  calificacion?: ResumenCalificacion | null;
}
