export type Rol = 'Jugador' | 'AdminComplejo' | 'Superadmin';

export interface DetalleError {
  campo: string;
  mensaje: string;
}

export interface ErrorBody {
  error: { codigo: string; mensaje: string; detalles?: DetalleError[]; datos?: unknown };
}
