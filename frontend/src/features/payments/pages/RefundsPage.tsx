import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Modal, Spinner, useToast } from '../../../components/ui';
import { formatCOP, formatFecha, formatHora } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { reembolsosDeComplejo, resolverReembolso } from '../api';
import { nombreCancha } from '../types';
import type { ReembolsoComplejo } from '../types';

type Vista = 'pendiente' | 'reembolsado';
const PESTANAS: { id: Vista; texto: string }[] = [
  { id: 'pendiente', texto: 'Pendientes' },
  { id: 'reembolsado', texto: 'Reembolsados' },
];

export function RefundsPage() {
  const { id } = useParams();
  const complejoId = Number(id);
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [vista, setVista] = useState<Vista>('pendiente');
  const [confirmar, setConfirmar] = useState<ReembolsoComplejo | null>(null);

  const consulta = useQuery({
    queryKey: ['reembolsos-complejo', complejoId, vista],
    queryFn: () => reembolsosDeComplejo(complejoId, vista),
    enabled: Number.isInteger(complejoId) && complejoId > 0,
  });

  const resolver = useMutation({
    mutationFn: (r: ReembolsoComplejo) => resolverReembolso(r.id),
    onSuccess: () => {
      mostrar('Reembolso marcado como realizado.', 'success');
      setConfirmar(null);
      void qc.invalidateQueries({ queryKey: ['reembolsos-complejo', complejoId] });
      void qc.invalidateQueries({ queryKey: ['pagos-complejo', complejoId] });
    },
  });

  function cerrar() {
    setConfirmar(null);
    resolver.reset();
  }

  return (
    <div className="page stack stack--wide">
      <p>
        <Link to={`/mis-complejos/${complejoId}`}>← Administrar complejo</Link>
      </p>
      <h1>Reembolsos</h1>
      <nav aria-label="Secciones de reservas" className="row-actions">
        <Link className="btn btn--secondary" to={`/mis-complejos/${complejoId}/reservas`}>
          Calendario
        </Link>
        <Link className="btn btn--secondary" to={`/mis-complejos/${complejoId}/pagos`}>
          Pagos
        </Link>
      </nav>

      <div role="tablist" aria-label="Estado del reembolso" className="tabs">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`tab-${p.id}`}
            aria-selected={vista === p.id}
            aria-controls="panel-reembolsos"
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

      <div role="tabpanel" id="panel-reembolsos" aria-labelledby={`tab-${vista}`} className="tabpanel stack stack--wide">
        {consulta.isPending && <Spinner />}
        {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
        {consulta.isSuccess && consulta.data.reembolsos.length === 0 && <p>{vista === 'pendiente' ? 'No hay reembolsos pendientes.' : 'Aún no hay reembolsos realizados.'}</p>}
        {consulta.isSuccess && consulta.data.reembolsos.length > 0 && (
          <ul className="card-grid">
            {consulta.data.reembolsos.map((r) => (
              <li key={r.id}>
                <Card className="card--wide stack stack--wide">
                  <div className="court-card__head">
                    <h2>{formatCOP(r.valor)}</h2>
                    <Badge tone={r.estado === 'pendiente' ? 'warning' : 'success'}>{r.estado === 'pendiente' ? 'Pendiente' : 'Reembolsado'}</Badge>
                  </div>
                  <p>
                    {r.porcentaje}% · {r.motivo}
                  </p>
                  <p className="muted">
                    Reserva <strong>{r.reserva.codigo}</strong> · {nombreCancha(r.reserva)}
                    <br />
                    {formatFecha(r.reserva.fecha)}, {formatHora(r.reserva.horaInicio)}
                    {r.reserva.cliente && <> · {r.reserva.cliente}</>}
                  </p>
                  {r.estado === 'pendiente' && (
                    <Button variant="secondary" onClick={() => setConfirmar(r)}>
                      Marcar reembolsado
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        abierto={confirmar !== null}
        titulo="Confirmar reembolso"
        onCerrar={cerrar}
        acciones={
          <>
            <Button variant="ghost" onClick={cerrar}>
              Volver
            </Button>
            <Button loading={resolver.isPending} onClick={() => confirmar && resolver.mutate(confirmar)}>
              Sí, marcar reembolsado
            </Button>
          </>
        }
      >
        {confirmar && (
          <>
            <p>
              ¿Confirmas que ya devolviste {formatCOP(confirmar.valor)} de la reserva {confirmar.reserva.codigo}? Esta acción no se puede deshacer.
            </p>
            {resolver.error && <Alert tone="error">{mensajeError(resolver.error)}</Alert>}
          </>
        )}
      </Modal>
    </div>
  );
}
