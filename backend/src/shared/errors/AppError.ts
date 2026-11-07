export interface DetalleError {
  campo: string;
  mensaje: string;
}

/**
 * Error de negocio con código HTTP (HT-03). El mensaje es para el usuario final: en español y sin
 * detalles técnicos. Respuesta: `{ "error": { "codigo", "mensaje", "detalles?", "datos?" } }`.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles?: DetalleError[],
    /** Información adicional estructurada (p. ej. reservas en conflicto). */
    readonly datos?: unknown,
  ) {
    super(mensaje);
    this.name = 'AppError';
  }

  static validacion(detalles: DetalleError[], mensaje = 'Revisa los datos ingresados.'): AppError {
    return new AppError(400, 'VALIDACION', mensaje, detalles);
  }

  static noAutenticado(mensaje = 'Debes iniciar sesión.'): AppError {
    return new AppError(401, 'NO_AUTENTICADO', mensaje);
  }

  static prohibido(mensaje = 'No tienes permiso para realizar esta acción.'): AppError {
    return new AppError(403, 'PROHIBIDO', mensaje);
  }

  static noEncontrado(codigo: string, mensaje: string): AppError {
    return new AppError(404, codigo, mensaje);
  }

  static conflicto(codigo: string, mensaje: string, datos?: unknown): AppError {
    return new AppError(409, codigo, mensaje, undefined, datos);
  }
}
