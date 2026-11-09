import { useMutation, useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { aMinutos, mensajeError } from '../../venues/utils';
import { obtenerComplejo, obtenerFranjas } from '../../venues/api';
import { crearReserva, disponibilidadComplejo } from '../api';
import { BookingSummary } from '../components/BookingSummary';

export function BookingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canchaId = Number(params.get('canchaId'));
  const fecha = params.get('fecha') ?? '';
  const hora = params.get('hora') ?? '';
  const valido = Number.isInteger(canchaId) && canchaId > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && /^\d{2}:\d{2}$/.test(hora);

  const franjas = useQuery({
    queryKey: ['franjas', canchaId, fecha],
    queryFn: () => obtenerFranjas(canchaId, fecha),
    enabled: valido,
  });
  const complejoId = franjas.data?.cancha.complejoId;
  const complejo = useQuery({
    queryKey: ['complejo', complejoId],
    queryFn: () => obtenerComplejo(complejoId ?? 0),
    enabled: complejoId !== undefined,
  });

  const disp = useQuery({
    queryKey: ['disponibilidad-complejo', complejoId, fecha],
    queryFn: () => disponibilidadComplejo(complejoId ?? 0, fecha),
    enabled: complejoId !== undefined,
    staleTime: 0,
  });

  const reservar = useMutation({
    mutationFn: () => crearReserva({ canchaId, fecha, horaInicio: hora }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['mis-reservas'] });
      void qc.invalidateQueries({ queryKey: ['disponibilidad'] });
      void qc.invalidateQueries({ queryKey: ['disponibilidad-complejo'] });
      void navigate(`/reservas/${r.reserva.id}/pagar`);
    },
  });

  if (!valido) {
    return (
      <div className="page page--narrow stack">
        <h1>Reservar cancha</h1>
        <Alert tone="error">Faltan datos de la reserva. Elige una franja libre para continuar.</Alert>
        <Link className="btn btn--primary" to="/disponibilidad">
          Buscar cancha
        </Link>
      </div>
    );
  }
  if (franjas.isPending || (complejoId !== undefined && (complejo.isPending || disp.isPending))) return <Spinner />;
  if (franjas.isError || complejo.isError || disp.isError) {
    const err = franjas.error ?? complejo.error ?? disp.error;
    return (
      <div className="page page--narrow stack">
        <h1>Reservar cancha</h1>
        <Alert tone="error">{err instanceof ApiError && err.status === 404 ? 'La cancha no existe.' : mensajeError(err)}</Alert>
        <Link className="btn btn--primary" to="/disponibilidad">
          Buscar cancha
        </Link>
      </div>
    );
  }

  const franja = disp.data?.canchas.find((x) => x.id === canchaId)?.franjas.find((f) => aMinutos(f.horaInicio) === aMinutos(hora));
  const c = complejo.data?.complejo;
  const error = reservar.error;
  const codigo = error instanceof ApiError ? error.codigo : null;
  const volver = c ? `/complejos/${c.id}` : '/disponibilidad';

  return (
    <div className="page page--narrow stack stack--wide">
      <h1>Confirma tu reserva</h1>
      <p className="muted">Paso 1 de 2: revisa los datos. Luego pagas el abono para asegurar la cancha.</p>
      <Card>
        <BookingSummary
          complejo={c?.nombre ?? '—'}
          {...(c ? { direccion: c.direccion } : {})}
          cancha={franjas.data.cancha.nombre}
          fecha={fecha}
          horaInicio={hora}
          {...(franja ? { horaFin: franja.horaFin } : {})}
          precio={franja?.precio ?? null}
          abonoNota={c ? `${c.porcentajeAbono} % del valor (se confirma al reservar)` : 'Se confirma al reservar'}
        />
      </Card>

      {franja && franja.estado !== 'libre' && <Alert tone="warning">Esta franja ya no está libre ({franja.estado === 'reservada' ? 'está reservada' : 'no se puede reservar'}).</Alert>}

      {error && (
        <Alert tone="error">
          {codigo === 'CORREO_NO_VERIFICADO' ? (
            <>
              {error.message} Usa el aviso de verificación en la parte superior para reenviar el correo.
            </>
          ) : codigo === 'FRANJA_NO_DISPONIBLE' ? (
            <>
              La franja ya no está disponible. <Link to={volver}>Volver al complejo</Link> o <Link to="/disponibilidad">buscar otra cancha</Link>.
            </>
          ) : (
            mensajeError(error)
          )}
        </Alert>
      )}

      <div className="row-actions">
        <Button onClick={() => reservar.mutate()} loading={reservar.isPending} disabled={franja?.estado !== undefined && franja.estado !== 'libre'}>
          Confirmar reserva
        </Button>
        <Link className="btn btn--ghost" to={volver}>
          Volver
        </Link>
      </div>
    </div>
  );
}
