import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, Input, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatFecha, formatHora } from '../../../lib/format';
import { crearBloqueo, eliminarBloqueo, listarBloqueos } from '../api';
import type { Cancha, ReservaActiva } from '../types';
import { formatFechaHora, mensajeError } from '../utils';

function reservasEnConflicto(err: unknown): ReservaActiva[] | null {
  if (!(err instanceof ApiError) || err.codigo !== 'BLOQUEO_CON_RESERVAS') return null;
  const datos = err.datos;
  if (typeof datos !== 'object' || datos === null || !('reservas' in datos)) return [];
  const r = (datos as { reservas: unknown }).reservas;
  return Array.isArray(r) ? (r as ReservaActiva[]) : [];
}

export function BlockForm({ cancha }: { cancha: Cancha }) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const clave = ['bloqueos', cancha.id];
  const consulta = useQuery({ queryKey: clave, queryFn: () => listarBloqueos(cancha.id) });

  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<ReservaActiva[] | null>(null);

  const crear = useMutation({
    mutationFn: () => crearBloqueo(cancha.id, { fechaInicio: inicio, fechaFin: fin, motivo: motivo.trim() }),
    onSuccess: () => {
      mostrar('Bloqueo creado.', 'success');
      setInicio('');
      setFin('');
      setMotivo('');
      void qc.invalidateQueries({ queryKey: clave });
      void qc.invalidateQueries({ queryKey: ['franjas'] });
    },
    onError: (e) => {
      const reservas = reservasEnConflicto(e);
      if (reservas) {
        setConflicto(reservas);
      } else {
        setError(mensajeError(e));
      }
    },
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarBloqueo(id),
    onSuccess: () => {
      mostrar('Bloqueo eliminado.', 'success');
      void qc.invalidateQueries({ queryKey: clave });
      void qc.invalidateQueries({ queryKey: ['franjas'] });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConflicto(null);
    if (!inicio || !fin) {
      setError('Indica la fecha y hora de inicio y de fin.');
      return;
    }
    if (fin <= inicio) {
      setError('El fin del bloqueo debe ser posterior al inicio.');
      return;
    }
    if (!motivo.trim()) {
      setError('Escribe el motivo del bloqueo.');
      return;
    }
    crear.mutate();
  }

  const bloqueos = consulta.data?.bloqueos ?? [];

  return (
    <div className="stack stack--wide">
      <Card>
        <h2>Bloqueos de {cancha.nombre}</h2>
        <p className="muted">Un bloqueo cierra la cancha en un rango de fechas (mantenimiento, eventos, etc.).</p>
        {consulta.isPending && <Spinner />}
        {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
        {consulta.isSuccess && bloqueos.length === 0 && <p>No hay bloqueos registrados.</p>}
        {bloqueos.length > 0 && (
          <ul className="item-list">
            {bloqueos.map((b) => (
              <li key={b.id}>
                <span>
                  <strong>{formatFechaHora(b.fechaInicio)}</strong> hasta <strong>{formatFechaHora(b.fechaFin)}</strong>
                  <br />
                  <span className="muted">{b.motivo}</span>
                </span>
                <Button
                  variant="ghost"
                  loading={borrar.isPending && borrar.variables === b.id}
                  onClick={() => {
                    if (window.confirm('¿Eliminar este bloqueo?')) borrar.mutate(b.id);
                  }}
                >
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <form onSubmit={enviar} noValidate className="form">
          <h3>Nuevo bloqueo</h3>
          {error && <Alert tone="error">{error}</Alert>}
          {conflicto && (
            <Alert tone="error">
              <div>
                <p>
                  <strong>No se puede bloquear: hay reservas en ese rango.</strong> Reprograma o cancela primero estas reservas y vuelve a
                  intentarlo.
                </p>
                {conflicto.length > 0 && (
                  <ul>
                    {conflicto.map((r) => (
                      <li key={r.id}>
                        {r.codigo}: {formatFecha(r.fecha)}, {formatHora(r.horaInicio)} - {formatHora(r.horaFin)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Alert>
          )}
          <div className="form__row">
            <Input label="Inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <Input label="Fin" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
          <Input label="Motivo" maxLength={150} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Button type="submit" loading={crear.isPending}>
            Crear bloqueo
          </Button>
        </form>
      </Card>
    </div>
  );
}
