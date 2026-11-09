import { Badge } from '../../../components/ui';
import { formatCOP, formatFecha, formatHora } from '../../../lib/format';
import type { EstadoReserva } from '../types';

const ESTADOS: Record<EstadoReserva, { texto: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  pendiente_pago: { texto: 'Pendiente de pago', tone: 'warning' },
  confirmada: { texto: 'Confirmada', tone: 'success' },
  pagada: { texto: 'Pagada', tone: 'success' },
  cancelada: { texto: 'Cancelada', tone: 'danger' },
  expirada: { texto: 'Expirada', tone: 'neutral' },
  completada: { texto: 'Completada', tone: 'info' },
  no_asistio: { texto: 'No asistió', tone: 'danger' },
};

export function EstadoReservaBadge({ estado }: { estado: EstadoReserva }) {
  const e = ESTADOS[estado];
  return <Badge tone={e.tone}>{e.texto}</Badge>;
}

export const ESTADOS_ACTIVOS: EstadoReserva[] = ['pendiente_pago', 'confirmada', 'pagada'];

interface BookingSummaryProps {
  complejo: string;
  direccion?: string;
  cancha: string;
  fecha: string;
  horaInicio: string;
  horaFin?: string;
  precio: number | null;
  abono?: number | undefined;
  /** Texto cuando el abono aún no se conoce. */
  abonoNota?: string;
  codigo?: string;
}

export function BookingSummary({ complejo, direccion, cancha, fecha, horaInicio, horaFin, precio, abono, abonoNota, codigo }: BookingSummaryProps) {
  return (
    <dl className="summary">
      {codigo && (
        <div>
          <dt>Código de reserva</dt>
          <dd>
            <strong>{codigo}</strong>
          </dd>
        </div>
      )}
      <div>
        <dt>Complejo</dt>
        <dd>
          {complejo}
          {direccion && <span className="muted"> · {direccion}</span>}
        </dd>
      </div>
      <div>
        <dt>Cancha</dt>
        <dd>{cancha}</dd>
      </div>
      <div>
        <dt>Fecha</dt>
        <dd>{formatFecha(fecha)}</dd>
      </div>
      <div>
        <dt>Hora</dt>
        <dd>
          {formatHora(horaInicio)}
          {horaFin ? ` - ${formatHora(horaFin)}` : ''}
        </dd>
      </div>
      <div>
        <dt>Precio</dt>
        <dd>{precio !== null ? formatCOP(precio) : '—'}</dd>
      </div>
      {(abono !== undefined || abonoNota) && (
        <div>
          <dt>Abono requerido</dt>
          <dd>{abono !== undefined ? formatCOP(abono) : abonoNota}</dd>
        </div>
      )}
    </dl>
  );
}
