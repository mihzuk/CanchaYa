/**
 * Interfaz común de pagos (HT-08): cobrar, consultar estado y reembolsar.
 * Hoy existe una implementación simulada; integrar Wompi, PayU o Mercado Pago es escribir otra
 * implementación de esta interfaz, sin tocar los módulos.
 */
export type MetodoPagoEnLinea = 'tarjeta' | 'pse' | 'nequi';
export type EstadoTransaccion = 'aprobado' | 'rechazado' | 'pendiente';

export interface SolicitudCobro {
  /** Valor en pesos COP (entero). */
  valor: number;
  metodo: MetodoPagoEnLinea;
  /** Identifica el pago en CanchaYa (idempotencia). */
  referenciaInterna: string;
  descripcion: string;
  /** Datos del medio de pago que entrega el formulario de la pasarela (simulado: últimos dígitos). */
  datos?: Record<string, string>;
}

export interface ResultadoTransaccion {
  estado: EstadoTransaccion;
  /** Referencia de la pasarela. */
  referencia: string;
  mensaje?: string;
}

export interface PaymentGateway {
  readonly nombre: string;
  cobrar(solicitud: SolicitudCobro): Promise<ResultadoTransaccion>;
  consultarEstado(referencia: string): Promise<ResultadoTransaccion>;
  reembolsar(referencia: string, valor: number): Promise<ResultadoTransaccion>;
}
