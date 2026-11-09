import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Card, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatCOP } from '../../../lib/format';
import { obtenerReserva } from '../../bookings/api';
import { BookingSummary, EstadoReservaBadge } from '../../bookings/components/BookingSummary';
import type { Reserva } from '../../bookings/types';
import { mensajeError } from '../../venues/utils';
import { PaymentForm } from '../components/PaymentForm';

function mmss(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Segundos restantes que bajan cada segundo a partir del valor entregado por la API. */
function useCuentaRegresiva(fin: number, activo: boolean): number {
  const [restante, setRestante] = useState(() => Math.max(0, Math.ceil((fin - Date.now()) / 1000)));
  useEffect(() => {
    if (!activo) return;
    setRestante(Math.max(0, Math.ceil((fin - Date.now()) / 1000)));
    const t = window.setInterval(() => {
      const r = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      setRestante(r);
      if (r === 0) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [fin, activo]);
  return restante;
}

function Pago({ reserva, limite }: { reserva: Reserva; limite: number }) {
  const [pagada, setPagada] = useState<Reserva | null>(null);
  const pendiente = reserva.estado === 'pendiente_pago';
  const restante = useCuentaRegresiva(limite, pendiente);
  const vencido = pendiente && restante <= 0;

  if (pagada) {
    return (
      <div className="page page--narrow stack stack--wide">
        <Alert tone="success">¡Pago recibido! Tu reserva quedó confirmada.</Alert>
        <Card>
          <h1>Reserva {pagada.codigo}</h1>
          <BookingSummary
            codigo={pagada.codigo}
            complejo={pagada.complejo.nombre}
            direccion={pagada.complejo.direccion}
            cancha={pagada.cancha.nombre}
            fecha={pagada.fecha}
            horaInicio={pagada.horaInicio}
            horaFin={pagada.horaFin}
            precio={pagada.precioTotal}
          />
          <p>
            Pagado: <strong>{formatCOP(pagada.totalPagado)}</strong> · Saldo pendiente en el complejo: <strong>{formatCOP(pagada.saldoPendiente)}</strong>
          </p>
          <Link className="btn btn--primary" to="/mis-reservas">
            Ver mis reservas
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="page page--narrow stack stack--wide">
      <h1>Pagar reserva</h1>
      <Card>
        <div className="court-card__head">
          <h2>{reserva.codigo}</h2>
          <EstadoReservaBadge estado={reserva.estado} />
        </div>
        <BookingSummary
          complejo={reserva.complejo.nombre}
          direccion={reserva.complejo.direccion}
          cancha={reserva.cancha.nombre}
          fecha={reserva.fecha}
          horaInicio={reserva.horaInicio}
          horaFin={reserva.horaFin}
          precio={reserva.precioTotal}
          abono={reserva.abonoRequerido}
        />
      </Card>

      {pendiente ? (
        <>
          <div className={`countdown${vencido ? ' countdown--vencido' : ''}`}>
            {/* El anuncio para lectores de pantalla se actualiza cada minuto y al vencer, no cada segundo. */}
            <p className="sr-only" role="status" aria-live="polite">
              {vencido ? 'El tiempo para pagar venció.' : `Te quedan ${Math.ceil(restante / 60)} minutos para pagar.`}
            </p>
            {vencido ? (
              <p>
                <strong>El tiempo para pagar venció</strong>
              </p>
            ) : (
              <p aria-hidden="true">
                Tiempo para pagar: <strong className="countdown__time">{mmss(restante)}</strong>
              </p>
            )}
          </div>
          {vencido && (
            <Alert tone="error">
              Tu reserva expiró y la franja fue liberada. <Link to="/disponibilidad">Buscar otra cancha</Link>
            </Alert>
          )}
          <Card>
            <PaymentForm reserva={reserva} deshabilitado={vencido} onPagado={setPagada} />
          </Card>
        </>
      ) : (
        <Alert tone={reserva.estado === 'confirmada' || reserva.estado === 'pagada' ? 'success' : 'warning'}>
          {reserva.estado === 'confirmada' || reserva.estado === 'pagada'
            ? 'Esta reserva ya tiene su pago registrado.'
            : 'Esta reserva ya no admite pagos.'}{' '}
          <Link to="/mis-reservas">Ver mis reservas</Link>
        </Alert>
      )}
    </div>
  );
}

export function PaymentPage() {
  const { id } = useParams();
  const reservaId = Number(id);
  const idValido = /^\d+$/.test(id ?? '') && Number.isInteger(reservaId) && reservaId > 0;
  const consulta = useQuery({
    queryKey: ['reserva', reservaId],
    queryFn: () => obtenerReserva(reservaId),
    enabled: idValido,
    refetchOnWindowFocus: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  if (!idValido || (consulta.isError && consulta.error instanceof ApiError && consulta.error.status === 404)) {
    return (
      <div className="page page--narrow stack">
        <h1>Reserva no encontrada</h1>
        <Alert tone="error">No encontramos esa reserva.</Alert>
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
  const limite = consulta.dataUpdatedAt + consulta.data.reserva.segundosParaPagar * 1000;
  return <Pago key={`${consulta.data.reserva.id}-${consulta.dataUpdatedAt}`} reserva={consulta.data.reserva} limite={limite} />;
}
