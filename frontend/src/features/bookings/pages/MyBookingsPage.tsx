import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../../components/ui';
import { formatCOP, formatFecha, formatHora } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { misReservas } from '../api';
import { CancelBookingDialog } from '../components/CancelBookingDialog';
import { ESTADOS_ACTIVOS, EstadoReservaBadge } from '../components/BookingSummary';
import type { Reserva } from '../types';

type Vista = 'proximas' | 'historial';
const PESTANAS: { id: Vista; texto: string }[] = [
  { id: 'proximas', texto: 'Próximas' },
  { id: 'historial', texto: 'Historial' },
];

export function MyBookingsPage() {
  const [vista, setVista] = useState<Vista>('proximas');
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  const consulta = useQuery({ queryKey: ['mis-reservas', vista], queryFn: () => misReservas(vista) });

  return (
    <div className="page stack stack--wide">
      <h1>Mis reservas</h1>
      <div role="tablist" aria-label="Vista de reservas" className="tabs">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`tab-${p.id}`}
            aria-selected={vista === p.id}
            aria-controls="panel-reservas"
            tabIndex={vista === p.id ? 0 : -1}
            className={`tabs__tab${vista === p.id ? ' is-active' : ''}`}
            onClick={() => setVista(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const otro = PESTANAS.find((x) => x.id !== vista);
                if (otro) {
                  setVista(otro.id);
                  document.getElementById(`tab-${otro.id}`)?.focus();
                }
              }
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-reservas" aria-labelledby={`tab-${vista}`} className="tabpanel stack stack--wide">
        {consulta.isPending && <Spinner />}
        {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
        {consulta.isSuccess && consulta.data.reservas.length === 0 && (
          <Card>
            <p>{vista === 'proximas' ? 'No tienes reservas próximas.' : 'Aún no tienes historial de reservas.'}</p>
            <Link className="btn btn--primary" to="/disponibilidad">
              Buscar cancha
            </Link>
          </Card>
        )}
        {consulta.isSuccess && consulta.data.reservas.length > 0 && (
          <ul className="card-grid">
            {consulta.data.reservas.map((r) => (
              <li key={r.id}>
                <Card className="card--wide stack stack--wide">
                  <div className="court-card__head">
                    <h2>{r.complejo.nombre}</h2>
                    <EstadoReservaBadge estado={r.estado} />
                  </div>
                  <p className="muted">
                    {r.cancha.nombre} · Fútbol {r.cancha.tipoFutbol}
                  </p>
                  <p>
                    <strong>{formatFecha(r.fecha)}</strong>, {formatHora(r.horaInicio)} - {formatHora(r.horaFin)}
                  </p>
                  <p>
                    Código: <strong>{r.codigo}</strong>
                    {ESTADOS_ACTIVOS.includes(r.estado) && (
                      <>
                        <br />
                        Saldo pendiente: <strong>{formatCOP(r.saldoPendiente)}</strong>
                      </>
                    )}
                  </p>
                  <div className="row-actions">
                    {r.estado === 'pendiente_pago' && (
                      <Link className="btn btn--primary" to={`/reservas/${r.id}/pagar`}>
                        Pagar
                      </Link>
                    )}
                    {vista === 'proximas' && (r.estado === 'confirmada' || r.estado === 'pagada') && (
                      <Link className="btn btn--secondary" to={`/partidos/publicar?reservaId=${r.id}`}>
                        Publicar en Busca Partido
                      </Link>
                    )}
                    {r.estado === 'completada' ? (
                      <Link className="btn btn--primary" to={`/reservas/${r.id}`}>
                        Calificar complejo
                      </Link>
                    ) : (
                      <Link className="btn btn--ghost" to={`/reservas/${r.id}`}>
                        Ver detalle
                      </Link>
                    )}
                    {ESTADOS_ACTIVOS.includes(r.estado) && (
                      <Button variant="secondary" onClick={() => setCancelando(r)}>
                        Cancelar o reprogramar
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CancelBookingDialog reserva={cancelando} onCerrar={() => setCancelando(null)} />
    </div>
  );
}
