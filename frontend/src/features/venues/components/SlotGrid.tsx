import { formatCOP, formatHora } from '../../../lib/format';
import type { EstadoFranja, Franja } from '../types';

interface SlotGridProps {
  franjas: Franja[];
  /** Si se entrega, las franjas libres son botones seleccionables. */
  onSeleccionar?: (franja: Franja) => void;
  seleccionada?: string | null;
  /** Texto accesible para el grupo (por ejemplo, el nombre de la cancha). */
  etiqueta: string;
}

const ETIQUETAS: Record<EstadoFranja, string> = {
  libre: 'Libre',
  bloqueada: 'Bloqueada',
  pasada: 'Pasada',
  sin_tarifa: 'Sin tarifa',
  reservada: 'Reservada',
  partido_abierto: 'Partido abierto',
};

const LEYENDA: EstadoFranja[] = ['libre', 'bloqueada', 'pasada', 'sin_tarifa'];

export function SlotLegend() {
  return (
    <ul className="slot-legend" aria-label="Leyenda de colores">
      {LEYENDA.map((e) => (
        <li key={e}>
          <span className={`slot-legend__dot slot--${e}`} aria-hidden="true" />
          {ETIQUETAS[e]}
        </li>
      ))}
    </ul>
  );
}

export function SlotGrid({ franjas, onSeleccionar, seleccionada, etiqueta }: SlotGridProps) {
  if (franjas.length === 0) {
    return <p className="muted">No hay turnos para esta fecha: el complejo está cerrado.</p>;
  }
  return (
    <ul className="slot-grid" aria-label={`Turnos de ${etiqueta}`}>
      {franjas.map((f) => {
        const hora = `${formatHora(f.horaInicio)} - ${formatHora(f.horaFin)}`;
        const precio = f.precio !== null ? formatCOP(f.precio) : '—';
        const contenido = (
          <>
            <span className="slot__time">{hora}</span>
            <span className="slot__price">{precio}</span>
            <span className="slot__state">{ETIQUETAS[f.estado]}</span>
          </>
        );
        const clase = `slot slot--${f.estado}`;
        const seleccionable = f.estado === 'libre' && onSeleccionar !== undefined;
        return (
          <li key={f.horaInicio}>
            {seleccionable ? (
              <button
                type="button"
                className={`${clase}${seleccionada === f.horaInicio ? ' is-selected' : ''}`}
                aria-pressed={seleccionada === f.horaInicio}
                aria-label={`${hora}, ${precio}, libre`}
                onClick={() => onSeleccionar(f)}
              >
                {contenido}
              </button>
            ) : (
              <div className={clase}>{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
