import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Card, Modal, Spinner, useToast } from '../../../components/ui';
import { formatFecha } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { listarPendientes, resolverAprobacion } from '../api';
import type { ComplejoPendiente } from '../types';

export function PlatformAdminPage() {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [rechazando, setRechazando] = useState<ComplejoPendiente | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({ queryKey: ['complejos-pendientes'], queryFn: listarPendientes });

  const resolver = useMutation({
    mutationFn: (v: { id: number; aprobar: boolean; motivo?: string }) => resolverAprobacion(v.id, v.aprobar, v.motivo),
    onSuccess: (_r, v) => {
      mostrar(v.aprobar ? 'Complejo aprobado.' : 'Complejo rechazado.', 'success');
      setRechazando(null);
      setMotivo('');
      void qc.invalidateQueries({ queryKey: ['complejos-pendientes'] });
    },
    onError: (e) => {
      const msg = mensajeError(e);
      if (rechazando) setErrorMotivo(msg);
      else setError(msg);
    },
  });

  function confirmarRechazo() {
    if (!rechazando) return;
    if (!motivo.trim()) {
      setErrorMotivo('Escribe el motivo del rechazo.');
      return;
    }
    setErrorMotivo(null);
    resolver.mutate({ id: rechazando.id, aprobar: false, motivo: motivo.trim() });
  }

  function cerrarModal() {
    setRechazando(null);
    setMotivo('');
    setErrorMotivo(null);
  }

  const pendientes = consulta.data?.complejos ?? [];

  return (
    <div className="page stack stack--wide">
      <h1>Complejos pendientes de aprobación</h1>
      {consulta.isPending && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}
      {consulta.isSuccess && pendientes.length === 0 && <p>No hay complejos pendientes por revisar.</p>}
      <ul className="card-grid">
        {pendientes.map((c) => (
          <li key={c.id}>
            <Card>
              <h2>{c.nombre}</h2>
              <p className="muted">
                {c.direccion}, {c.barrio}, {c.ciudad}
                <br />
                Teléfono: {c.telefono}
                <br />
                Registrado: {formatFecha(c.fechaCreacion)}
              </p>
              {c.descripcion && <p>{c.descripcion}</p>}
              <div className="row-actions">
                <Button loading={resolver.isPending && resolver.variables?.id === c.id && resolver.variables.aprobar} onClick={() => resolver.mutate({ id: c.id, aprobar: true })}>
                  Aprobar
                </Button>
                <Button variant="danger" onClick={() => setRechazando(c)}>
                  Rechazar
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Modal
        abierto={rechazando !== null}
        titulo={`Rechazar ${rechazando?.nombre ?? 'complejo'}`}
        onCerrar={cerrarModal}
        acciones={
          <>
            <Button variant="ghost" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button variant="danger" loading={resolver.isPending} onClick={confirmarRechazo}>
              Rechazar complejo
            </Button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="motivo-rechazo" className="field__label">
            Motivo del rechazo (obligatorio)
          </label>
          <textarea id="motivo-rechazo" className="field__control" rows={4} maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-invalid={errorMotivo ? true : undefined} />
          <p className="field__hint">El administrador del complejo verá este motivo.</p>
          {errorMotivo && <p className="field__error">{errorMotivo}</p>}
        </div>
      </Modal>
    </div>
  );
}
