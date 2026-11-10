import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Input, Modal, Spinner, useToast } from '../../../components/ui';
import { formatCOP, formatFecha, formatHora, hoyBogota } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { cancelarReserva, disponibilidadComplejo, previsualizarCancelacion, reprogramarReserva } from '../api';
import type { Reserva } from '../types';

interface Props {
  reserva: Reserva | null;
  onCerrar: () => void;
}

function Contenido({ reserva, onCerrar }: { reserva: Reserva; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [motivo, setMotivo] = useState('');
  const [mostrarReprogramar, setMostrarReprogramar] = useState(false);
  const [fecha, setFecha] = useState('');
  const [elegida, setElegida] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['cancelacion', reserva.id],
    queryFn: () => previsualizarCancelacion(reserva.id),
    gcTime: 0,
  });
  const disp = useQuery({
    queryKey: ['disponibilidad-complejo', reserva.complejo.id, fecha],
    queryFn: () => disponibilidadComplejo(reserva.complejo.id, fecha),
    enabled: mostrarReprogramar && fecha !== '',
  });

  function refrescar() {
    void qc.invalidateQueries({ queryKey: ['mis-reservas'] });
    void qc.invalidateQueries({ queryKey: ['reserva'] });
    void qc.invalidateQueries({ queryKey: ['disponibilidad'] });
    void qc.invalidateQueries({ queryKey: ['disponibilidad-complejo'] });
    void qc.invalidateQueries({ queryKey: ['partidos'] });
    void qc.invalidateQueries({ queryKey: ['partido'] });
    void qc.invalidateQueries({ queryKey: ['notificaciones'] });
  }

  const cancelar = useMutation({
    mutationFn: () => cancelarReserva(reserva.id, motivo.trim() || undefined),
    onSuccess: (r) => {
      mostrar(
        r.valorReembolso > 0 ? `Reserva cancelada. Se solicitó el reembolso de ${formatCOP(r.valorReembolso)}.` : 'Reserva cancelada.',
        'success',
      );
      refrescar();
      onCerrar();
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const reprogramar = useMutation({
    mutationFn: () => {
      const [canchaId, hora] = elegida.split('|');
      return reprogramarReserva(reserva.id, { fecha, horaInicio: hora ?? '', canchaId: Number(canchaId) });
    },
    onSuccess: (r) => {
      const nueva = `${formatFecha(r.reserva.fecha)}, ${formatHora(r.reserva.horaInicio)}`;
      mostrar(
        r.excedenteReembolsado > 0
          ? `Reserva reprogramada para el ${nueva}. Te devolveremos ${formatCOP(r.excedenteReembolsado)}.`
          : `Reserva reprogramada para el ${nueva}.`,
        'success',
      );
      refrescar();
      onCerrar();
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const hoy = hoyBogota();
  const libres = (disp.data?.canchas ?? []).flatMap((c) =>
    c.franjas.filter((f) => f.estado === 'libre').map((f) => ({ canchaId: c.id, cancha: c.nombre, franja: f })),
  );

  return (
    <div className="stack stack--wide">
      <p>
        <strong>{reserva.complejo.nombre}</strong> · {reserva.cancha.nombre}
        <br />
        {formatFecha(reserva.fecha)}, {formatHora(reserva.horaInicio)} - {formatHora(reserva.horaFin)}
      </p>
      {preview.isPending && <Spinner label="Calculando reembolso…" />}
      {preview.isError && <Alert tone="error">{mensajeError(preview.error)}</Alert>}
      {preview.isSuccess && (
        <>
          <Alert tone={preview.data.porcentajeReembolso > 0 ? 'info' : 'warning'}>
            Si cancelas ahora se te reembolsa el {preview.data.porcentajeReembolso}% ({formatCOP(preview.data.valorReembolso)})
          </Alert>
          <p className="muted">
            Política: más de 24 h antes, 100 %; entre 6 y 24 h, 50 %; con menos de 6 h, sin reembolso.
          </p>
        </>
      )}
      {preview.isSuccess && preview.data.partidoAfectado && (
        <Alert tone="warning">
          <strong>Esta reserva tiene un partido publicado en Busca Partido.</strong> Si la cancelas, se cancelará el partido
          {preview.data.partidoAfectado.equipoRival ? (
            <>
              , se avisará al equipo rival ({preview.data.partidoAfectado.equipoRival}) y se le devolverá el 100 % de lo que haya pagado.
            </>
          ) : (
            '.'
          )}
        </Alert>
      )}
      {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}

      <Input label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} />
      <Button variant="danger" onClick={() => cancelar.mutate()} loading={cancelar.isPending} disabled={preview.isPending || reprogramar.isPending}>
        Cancelar reserva
      </Button>

      {preview.data?.puedeReprogramar && (
        <section className="stack stack--wide" aria-label="Reprogramar">
          <h3>Reprogramar</h3>
          {!mostrarReprogramar ? (
            <Button variant="secondary" onClick={() => setMostrarReprogramar(true)}>
              Reprogramar
            </Button>
          ) : (
            <>
              <Input
                label="Nueva fecha"
                type="date"
                min={hoy}
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setElegida('');
                }}
              />
              {fecha && disp.isPending && <Spinner label="Buscando franjas…" />}
              {disp.isError && <Alert tone="error">{mensajeError(disp.error)}</Alert>}
              {disp.isSuccess && libres.length === 0 && <p className="muted">No hay franjas libres ese día.</p>}
              {libres.length > 0 && (
                <fieldset className="slot-fieldset">
                  <legend>Elige una franja</legend>
                  <ul className="slot-grid">
                    {libres.map((l) => {
                      const valor = `${l.canchaId}|${l.franja.horaInicio}`;
                      return (
                        <li key={valor}>
                          <button
                            type="button"
                            className={`slot slot--libre${elegida === valor ? ' is-selected' : ''}`}
                            aria-pressed={elegida === valor}
                            onClick={() => setElegida(valor)}
                          >
                            <span className="slot__time">{formatHora(l.franja.horaInicio)}</span>
                            <span className="slot__state">{l.cancha}</span>
                            <span className="slot__price">{l.franja.precio !== null ? formatCOP(l.franja.precio) : '—'}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
              <Button onClick={() => reprogramar.mutate()} loading={reprogramar.isPending} disabled={!elegida || cancelar.isPending}>
                Confirmar reprogramación
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export function CancelBookingDialog({ reserva, onCerrar }: Props) {
  return (
    <Modal
      abierto={reserva !== null}
      titulo="Cancelar o reprogramar reserva"
      onCerrar={onCerrar}
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {reserva && <Contenido key={reserva.id} reserva={reserva} onCerrar={onCerrar} />}
    </Modal>
  );
}
