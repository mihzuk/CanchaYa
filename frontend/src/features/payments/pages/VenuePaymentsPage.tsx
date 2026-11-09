import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Input, Spinner } from '../../../components/ui';
import { formatCOP, formatFecha, formatHora } from '../../../lib/format';
import { formatFechaHora, mensajeError } from '../../venues/utils';
import { pagosDeComplejo } from '../api';
import { nombreCancha } from '../types';
import type { EstadoPago, MetodoPago, TipoPago } from '../types';

const METODOS: Record<MetodoPago, string> = { tarjeta: 'Tarjeta', pse: 'PSE', nequi: 'Nequi', efectivo: 'Efectivo', transferencia: 'Transferencia' };
const TIPOS: Record<TipoPago, string> = { abono: 'Abono', saldo: 'Saldo', aporte_jugador: 'Aporte de jugador' };
const ESTADOS: Record<EstadoPago, { texto: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  pendiente: { texto: 'Pendiente', tone: 'warning' },
  aprobado: { texto: 'Aprobado', tone: 'success' },
  rechazado: { texto: 'Rechazado', tone: 'danger' },
  reembolsado: { texto: 'Reembolsado', tone: 'info' },
};

export function VenuePaymentsPage() {
  const { id } = useParams();
  const complejoId = Number(id);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const rangoInvalido = desde !== '' && hasta !== '' && desde > hasta;

  const consulta = useQuery({
    queryKey: ['pagos-complejo', complejoId, desde, hasta],
    queryFn: () => pagosDeComplejo(complejoId, desde, hasta),
    enabled: Number.isInteger(complejoId) && complejoId > 0 && !rangoInvalido,
  });

  const pagos = consulta.data?.pagos ?? [];
  const aprobados = pagos.filter((p) => p.estado === 'aprobado');
  const totalRecibido = pagos.filter((p) => p.estado === 'aprobado' || p.estado === 'reembolsado').reduce((s, p) => s + p.valor, 0);
  const totalReembolsado = pagos.reduce((s, p) => s + (p.reembolsado ?? 0), 0);
  const totalPorReembolsar = pagos.reduce((s, p) => s + (p.reembolsoPendiente ?? 0), 0);
  const neto = totalRecibido - totalReembolsado - totalPorReembolsar;

  return (
    <div className="page stack stack--wide">
      <p>
        <Link to={`/mis-complejos/${complejoId}`}>← Administrar complejo</Link>
      </p>
      <h1>Pagos recibidos</h1>
      <nav aria-label="Secciones de reservas" className="row-actions">
        <Link className="btn btn--secondary" to={`/mis-complejos/${complejoId}/reservas`}>
          Calendario
        </Link>
        <Link className="btn btn--secondary" to={`/mis-complejos/${complejoId}/reembolsos`}>
          Reembolsos
        </Link>
      </nav>
      <div className="form__row">
        <Input label="Desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
        <Input
          label="Hasta"
          type="date"
          value={hasta}
          min={desde || undefined}
          onChange={(e) => setHasta(e.target.value)}
          error={rangoInvalido ? 'La fecha final debe ser igual o posterior a la inicial.' : undefined}
        />
      </div>

      {consulta.isPending && !rangoInvalido && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {consulta.isSuccess && (
        <>
          <dl className="stats" aria-label="Totales">
            <div>
              <dt>Pagos aprobados</dt>
              <dd>{aprobados.length}</dd>
            </div>
            <div>
              <dt>Total recibido</dt>
              <dd>{formatCOP(totalRecibido)}</dd>
            </div>
            <div>
              <dt>Reembolsado</dt>
              <dd>{formatCOP(totalReembolsado)}</dd>
            </div>
            <div>
              <dt>Por reembolsar</dt>
              <dd>{formatCOP(totalPorReembolsar)}</dd>
            </div>
            <div>
              <dt>Neto</dt>
              <dd>{formatCOP(neto)}</dd>
            </div>
          </dl>
          {pagos.length === 0 ? (
            <p>No hay pagos en este rango.</p>
          ) : (
            <div className="table-wrap" role="region" aria-label="Lista de pagos" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Reserva</th>
                    <th scope="col">Partido</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Valor</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Método</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Fecha del pago</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{p.reserva.codigo}</th>
                      <td>
                        {formatFecha(p.reserva.fecha)}, {formatHora(p.reserva.horaInicio)}
                        <br />
                        <span className="muted">{nombreCancha(p.reserva)}</span>
                      </td>
                      <td>{p.reserva.cliente ?? '—'}</td>
                      <td>
                        {formatCOP(p.valor)}
                        {p.reembolsado > 0 && (
                          <>
                            <br />
                            <span className="muted">Reembolsado {formatCOP(p.reembolsado)}</span>
                          </>
                        )}
                        {p.reembolsoPendiente > 0 && (
                          <>
                            <br />
                            <span className="muted">Por reembolsar {formatCOP(p.reembolsoPendiente)}</span>
                          </>
                        )}
                      </td>
                      <td>{TIPOS[p.tipo]}</td>
                      <td>
                        {METODOS[p.metodo]}
                        {p.referencia && (
                          <>
                            <br />
                            <span className="muted">Ref. {p.referencia}</span>
                          </>
                        )}
                      </td>
                      <td>
                        <Badge tone={ESTADOS[p.estado].tone}>{ESTADOS[p.estado].texto}</Badge>
                      </td>
                      <td>{formatFechaHora(p.fecha.slice(0, 16))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
