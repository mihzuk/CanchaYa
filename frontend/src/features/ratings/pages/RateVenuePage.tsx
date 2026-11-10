import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatCOP, formatFecha, formatHora } from '../../../lib/format';
import { obtenerReserva } from '../../bookings/api';
import { EstadoReservaBadge } from '../../bookings/components/BookingSummary';
import { mensajeError } from '../../venues/utils';
import { calificarReserva, miCalificacionDeReserva } from '../api';
import { StarRatingInput } from '../components/StarRating';

/** HU-30: calificar el complejo tras una reserva completada (la segunda vez se edita). */
export function RateVenueForm({ reservaId, complejoId }: { reservaId: number; complejoId: number }) {
  const qc = useQueryClient();
  const previa = useQuery({ queryKey: ['calificacion-reserva', reservaId], queryFn: () => miCalificacionDeReserva(reservaId) });
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const existente = previa.data?.calificacion ?? null;

  useEffect(() => {
    if (existente) {
      setEstrellas(existente.estrellas);
      setComentario(existente.comentario ?? '');
    }
  }, [existente]);

  const m = useMutation({
    mutationFn: () => calificarReserva(reservaId, { estrellas, ...(comentario.trim() ? { comentario: comentario.trim() } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calificacion-reserva', reservaId] });
      void qc.invalidateQueries({ queryKey: ['calificaciones-complejo', complejoId] });
      void qc.invalidateQueries({ queryKey: ['complejo', complejoId] });
      void qc.invalidateQueries({ queryKey: ['complejos'] });
      void qc.invalidateQueries({ queryKey: ['mis-complejos'] });
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (estrellas < 1) {
      setErrorLocal('Elige de 1 a 5 estrellas.');
      return;
    }
    setErrorLocal(null);
    m.mutate();
  }

  if (previa.isPending) return <Spinner />;
  const noCompletada = m.error instanceof ApiError && m.error.codigo === 'RESERVA_NO_COMPLETADA';

  return (
    <form className="form" onSubmit={enviar} noValidate aria-label="Calificar el complejo">
      <h2>{existente ? 'Editar mi calificación' : 'Califica tu experiencia'}</h2>
      {previa.isError && <Alert tone="error">{mensajeError(previa.error)}</Alert>}
      {m.isSuccess && <Alert tone="success">{existente ? 'Calificación guardada.' : '¡Gracias por tu calificación!'}</Alert>}
      {m.isError && <Alert tone="error">{noCompletada ? 'Solo puedes calificar una reserva que ya fue completada.' : mensajeError(m.error)}</Alert>}
      <StarRatingInput etiqueta="Calificación" valor={estrellas} onChange={setEstrellas} error={errorLocal ?? undefined} />
      <div className="field">
        <label className="field__label" htmlFor="comentario-reserva">
          Comentario (opcional)
        </label>
        <textarea id="comentario-reserva" className="field__control" rows={3} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </div>
      <Button type="submit" loading={m.isPending}>
        Enviar calificación
      </Button>
    </form>
  );
}

/** Detalle de una reserva propia (destino de las notificaciones de reserva). */
export function RateVenuePage() {
  const { id } = useParams();
  const reservaId = Number(id);
  const valido = /^\d+$/.test(id ?? '') && reservaId > 0;
  const consulta = useQuery({ queryKey: ['reserva', reservaId], queryFn: () => obtenerReserva(reservaId), enabled: valido, retry: false });

  if (!valido) {
    return (
      <div className="page page--narrow stack">
        <h1>Reserva no encontrada</h1>
        <Link className="btn btn--primary" to="/mis-reservas">
          Ver mis reservas
        </Link>
      </div>
    );
  }
  if (consulta.isPending) return <Spinner />;
  if (consulta.isError) {
    return (
      <div className="page page--narrow stack">
        <h1>No pudimos cargar la reserva</h1>
        <Alert tone="error">{mensajeError(consulta.error)}</Alert>
        <Link className="btn btn--primary" to="/mis-reservas">
          Ver mis reservas
        </Link>
      </div>
    );
  }

  const r = consulta.data.reserva;
  return (
    <div className="page page--narrow stack stack--wide">
      <p>
        <Link to="/mis-reservas">← Mis reservas</Link>
      </p>
      <h1>Detalle de la reserva</h1>
      <Card className="stack">
        <div className="court-card__head">
          <h2>
            <Link to={`/complejos/${r.complejo.id}`}>{r.complejo.nombre}</Link>
          </h2>
          <EstadoReservaBadge estado={r.estado} />
        </div>
        <p className="muted">
          {r.cancha.nombre} · Fútbol {r.cancha.tipoFutbol} · {r.complejo.direccion}, {r.complejo.barrio}
        </p>
        <p>
          <strong>{formatFecha(r.fecha)}</strong>, {formatHora(r.horaInicio)} - {formatHora(r.horaFin)}
        </p>
        <p>
          Código: <strong>{r.codigo}</strong>
          <br />
          Total {formatCOP(r.precioTotal)} · Pagado {formatCOP(r.totalPagado)} · Saldo {formatCOP(r.saldoPendiente)}
        </p>
        {r.motivoCancelacion && <p className="muted">Motivo de cancelación: {r.motivoCancelacion}</p>}
      </Card>
      {r.estado === 'completada' && (
        <Card className="stack">
          <RateVenueForm reservaId={r.id} complejoId={r.complejo.id} />
        </Card>
      )}
    </div>
  );
}
