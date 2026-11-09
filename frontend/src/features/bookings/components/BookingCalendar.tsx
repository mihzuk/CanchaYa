import { formatHora } from '../../../lib/format';
import type { Cancha } from '../../venues/types';
import type { Reserva } from '../types';
import { EstadoReservaBadge } from './BookingSummary';

interface Props {
  canchas: Cancha[];
  reservas: Reserva[];
  onSeleccionar: (reserva: Reserva) => void;
}

const HORA_MIN = 6;
const HORA_MAX = 23;

export function nombreCliente(r: Reserva): string {
  return r.nombreClienteManual ?? r.nombreJugador ?? 'Jugador de la web';
}

function horaDe(r: Reserva): number {
  return Number(r.horaInicio.slice(0, 2));
}

function Chip({ r, onSeleccionar }: { r: Reserva; onSeleccionar: (r: Reserva) => void }) {
  const inactiva = r.estado === 'cancelada' || r.estado === 'expirada';
  return (
    <button
      type="button"
      className={`cal-chip cal-chip--${r.estado}${inactiva ? ' is-inactive' : ''}`}
      onClick={() => onSeleccionar(r)}
      aria-label={`Reserva ${r.codigo}, ${formatHora(r.horaInicio)} a ${formatHora(r.horaFin)}, ${nombreCliente(r)}. Ver acciones`}
    >
      <span className="cal-chip__time">
        {formatHora(r.horaInicio)} - {formatHora(r.horaFin)}
      </span>
      <span className="cal-chip__code">{r.codigo}</span>
      <span className="cal-chip__client">{nombreCliente(r)}</span>
      <EstadoReservaBadge estado={r.estado} />
    </button>
  );
}

export function BookingCalendar({ canchas, reservas, onSeleccionar }: Props) {
  const horas: number[] = [];
  const minima = Math.min(HORA_MIN, ...reservas.map(horaDe));
  const maxima = Math.max(HORA_MAX, ...reservas.map(horaDe));
  for (let h = minima; h <= maxima; h++) horas.push(h);

  if (canchas.length === 0) return <p className="muted">Este complejo aún no tiene canchas.</p>;

  return (
    <>
      {/* Escritorio y tableta: columnas = canchas, filas = horas */}
      <div className="cal cal--grid" role="region" aria-label="Calendario de reservas" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              {canchas.map((c) => (
                <th key={c.id} scope="col">
                  {c.nombre}
                  <br />
                  <span className="muted">Fútbol {c.tipoFutbol}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map((h) => (
              <tr key={h}>
                <th scope="row">{String(h).padStart(2, '0')}:00</th>
                {canchas.map((c) => (
                  <td key={c.id}>
                    {reservas
                      .filter((r) => r.canchaId === c.id && horaDe(r) === h)
                      .map((r) => (
                        <Chip key={r.id} r={r} onSeleccionar={onSeleccionar} />
                      ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: lista agrupada por cancha */}
      <div className="cal cal--list">
        {canchas.map((c) => {
          const delaCancha = reservas.filter((r) => r.canchaId === c.id);
          return (
            <section key={c.id} aria-label={c.nombre} className="cal__group">
              <h3>
                {c.nombre} <span className="muted">· Fútbol {c.tipoFutbol}</span>
              </h3>
              {delaCancha.length === 0 ? (
                <p className="muted">Sin reservas este día.</p>
              ) : (
                <ul className="cal__items">
                  {delaCancha.map((r) => (
                    <li key={r.id}>
                      <Chip r={r} onSeleccionar={onSeleccionar} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
