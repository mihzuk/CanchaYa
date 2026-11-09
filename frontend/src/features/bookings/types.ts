import type { Cancha, Franja } from '../venues/types';

export type EstadoReserva = 'pendiente_pago' | 'confirmada' | 'pagada' | 'cancelada' | 'expirada' | 'completada' | 'no_asistio';

export interface Reserva {
  id: number;
  codigo: string;
  usuarioId: number | null;
  canchaId: number;
  cancha: { nombre: string; tipoFutbol: number };
  complejo: { id: number; nombre: string; direccion: string; ciudad: string; barrio: string };
  fecha: string;
  horaInicio: string;
  horaFin: string;
  precioTotal: number;
  abonoRequerido: number;
  saldoPendiente: number;
  totalPagado: number;
  estado: EstadoReserva;
  origen: 'web' | 'manual';
  nombreJugador?: string | null;
  nombreClienteManual: string | null;
  celularClienteManual: string | null;
  reprogramadaDeId: number | null;
  motivoCancelacion: string | null;
  fechaCreacion: string;
  fechaExpiracion: string | null;
  fechaCancelacion: string | null;
  segundosParaPagar: number;
}

export type FranjaDisponible = Franja;

export interface CanchaDisponibilidad {
  id: number;
  nombre: string;
  tipoFutbol: number;
  franjas: FranjaDisponible[];
}
export interface DisponibilidadComplejo {
  fecha: string;
  canchas: CanchaDisponibilidad[];
}

export interface ComplejoBusqueda {
  id: number;
  nombre: string;
  ciudad: string;
  barrio: string;
  direccion: string;
  fotoPrincipal: string | null;
  distanciaKm: number | null;
}
export interface ResultadoBusqueda {
  complejo: ComplejoBusqueda;
  canchas: {
    id: number;
    nombre: string;
    tipoFutbol: number;
    techada: boolean;
    iluminacion: boolean;
    franjas: FranjaDisponible[];
  }[];
  precioDesde: number | null;
}
export interface Sugerencia {
  complejo: ComplejoBusqueda;
  cancha: { id: number; nombre: string; tipoFutbol: number };
  franja: FranjaDisponible;
}
export interface RespuestaBusqueda {
  fecha: string;
  resultados: ResultadoBusqueda[];
  sugerencias: Sugerencia[];
  limitado?: boolean;
}

export interface FiltrosDisponibilidad {
  fecha: string;
  ciudad: string;
  barrio: string;
  tipoFutbol: string;
  horaDesde: string;
  horaHasta: string;
  lat: string;
  lng: string;
}

export interface CalendarioComplejo {
  fecha: string;
  canchas: Cancha[];
  reservas: Reserva[];
}

export interface ReservaManualInput {
  canchaId: number;
  fecha: string;
  horaInicio: string;
  nombreCliente: string;
  celularCliente: string;
}

export interface PrevisualizacionCancelacion {
  horasDeAnticipacion: number;
  porcentajeReembolso: number;
  totalPagado: number;
  valorReembolso: number;
  puedeReprogramar: boolean;
}
