import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Input, Modal, Select, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatCOP, formatFecha, formatHora, hoyBogota } from '../../../lib/format';
import { registrarPagoManual } from '../../payments/api';
import { mensajeError } from '../../venues/utils';
import { calendarioComplejo, cambiarEstadoReserva, cancelarReserva, crearReservaManual, disponibilidadComplejo, moverReserva } from '../api';
import { BookingCalendar, nombreCliente } from '../components/BookingCalendar';
import { ESTADOS_ACTIVOS, EstadoReservaBadge } from '../components/BookingSummary';
import type { Reserva } from '../types';

function detalle(err: unknown, campo: string): string | undefined {
  return err instanceof ApiError ? err.detalles.find((d) => d.campo === campo)?.mensaje : undefined;
}

/** Fecha y hora actuales de Bogotá como 'YYYY-MM-DDTHH:MM' (comparable como texto). */
function ahoraBogota(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

function useRefrescarComplejo(complejoId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['calendario', complejoId] });
    void qc.invalidateQueries({ queryKey: ['disponibilidad-complejo', complejoId] });
    void qc.invalidateQueries({ queryKey: ['disponibilidad'] });
    void qc.invalidateQueries({ queryKey: ['pagos-complejo', complejoId] });
    void qc.invalidateQueries({ queryKey: ['reembolsos-complejo', complejoId] });
    void qc.invalidateQueries({ queryKey: ['partidos'] });
    void qc.invalidateQueries({ queryKey: ['partido'] });
  };
}

function MoverReserva({ reserva, complejoId, onCerrar }: { reserva: Reserva; complejoId: number; onCerrar: () => void }) {
  const refrescar = useRefrescarComplejo(complejoId);
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState('');
  const [elegida, setElegida] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | undefined>();

  const disp = useQuery({
    queryKey: ['disponibilidad-complejo', complejoId, fecha],
    queryFn: () => disponibilidadComplejo(complejoId, fecha),
    enabled: abierto && fecha !== '',
  });
  const libres = (disp.data?.canchas ?? []).flatMap((c) =>
    c.franjas.filter((f) => f.estado === 'libre').map((f) => ({ canchaId: c.id, cancha: c.nombre, franja: f })),
  );

  const mover = useMutation({
    mutationFn: () => {
      const [canchaId, hora] = elegida.split('|');
      return moverReserva(reserva.id, { fecha, horaInicio: hora ?? '', canchaId: Number(canchaId), motivo: motivo.trim() });
    },
    onSuccess: (r) => {
      mostrar(`Reserva movida al ${formatFecha(r.reserva.fecha)}, ${formatHora(r.reserva.horaInicio)}. Se avisó al cliente.`, 'success');
      refrescar();
      onCerrar();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!fecha || !elegida) {
      setErrorLocal('Elige la nueva fecha y una franja libre.');
      return;
    }
    if (!motivo.trim()) {
      setErrorLocal('Indica el motivo del cambio para el cliente.');
      return;
    }
    setErrorLocal(undefined);
    mover.mutate();
  }

  if (!abierto) {
    return (
      <section className="stack stack--wide" aria-label="Mover reserva">
        <h3>Mover reserva</h3>
        <div>
          <Button variant="secondary" onClick={() => setAbierto(true)}>
            Mover reserva
          </Button>
        </div>
      </section>
    );
  }
  return (
    <form onSubmit={enviar} noValidate className="form" aria-label="Mover reserva">
      <h3>Mover reserva</h3>
      <p className="muted">Al cliente nunca se le cobra más por este cambio.</p>
      {errorLocal && <Alert tone="error">{errorLocal}</Alert>}
      {mover.error && <Alert tone="error">{mensajeError(mover.error)}</Alert>}
      <Input
        label="Nueva fecha"
        type="date"
        min={hoyBogota()}
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
          <legend>Nueva hora (franja libre)</legend>
          <ul className="slot-grid">
            {libres.map((l) => {
              const valor = `${l.canchaId}|${l.franja.horaInicio}`;
              return (
                <li key={valor}>
                  <button type="button" className={`slot slot--libre${elegida === valor ? ' is-selected' : ''}`} aria-pressed={elegida === valor} onClick={() => setElegida(valor)}>
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
      <Input label="Motivo del cambio (obligatorio, se le informa al cliente)" value={motivo} maxLength={255} onChange={(e) => setMotivo(e.target.value)} error={detalle(mover.error, 'motivo')} />
      <div className="row-actions">
        <Button type="submit" loading={mover.isPending}>
          Mover reserva
        </Button>
        <Button variant="ghost" onClick={() => setAbierto(false)}>
          No mover
        </Button>
      </div>
    </form>
  );
}

function AccionesReserva({ reserva, complejoId, onCerrar }: { reserva: Reserva; complejoId: number; onCerrar: () => void }) {
  const refrescar = useRefrescarComplejo(complejoId);
  const { mostrar } = useToast();
  const [tipo, setTipo] = useState<'saldo' | 'abono'>(reserva.estado === 'pendiente_pago' ? 'abono' : 'saldo');
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [valor, setValor] = useState('');
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | undefined>();

  const activa = ESTADOS_ACTIVOS.includes(reserva.estado);
  const inicio = `${reserva.fecha.slice(0, 10)}T${formatHora(reserva.horaInicio)}`;
  const iniciada = inicio <= ahoraBogota();
  const puedePagar = activa && (reserva.saldoPendiente > 0 || reserva.estado === 'pendiente_pago');

  const pago = useMutation({
    mutationFn: () => {
      const v = valor.trim() === '' ? undefined : Number(valor);
      return registrarPagoManual(reserva.id, {
        tipo,
        metodo,
        ...(v !== undefined ? { valor: v } : {}),
        ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
      });
    },
    onSuccess: () => {
      mostrar('Pago registrado.', 'success');
      refrescar();
      onCerrar();
    },
  });
  const estado = useMutation({
    mutationFn: (e: 'completada' | 'no_asistio') => cambiarEstadoReserva(reserva.id, e),
    onSuccess: (_r, e) => {
      mostrar(e === 'completada' ? 'Reserva marcada como completada.' : 'Reserva marcada como no asistió.', 'success');
      refrescar();
      onCerrar();
    },
  });
  const cancelar = useMutation({
    mutationFn: () => cancelarReserva(reserva.id, motivo.trim()),
    onSuccess: (r) => {
      mostrar(`Reserva cancelada. Reembolso del 100 % (${formatCOP(r.valorReembolso)}) pendiente.`, 'success');
      refrescar();
      onCerrar();
    },
  });

  function enviarPago(e: FormEvent) {
    e.preventDefault();
    pago.mutate();
  }
  function enviarCancelar(e: FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) {
      setErrorMotivo('Indica el motivo de la cancelación para el cliente.');
      return;
    }
    setErrorMotivo(undefined);
    cancelar.mutate();
  }

  const errorGeneral = estado.error ?? (pago.error && !(pago.error instanceof ApiError && pago.error.detalles.length > 0) ? pago.error : null);

  return (
    <div className="stack stack--wide">
      <p>
        <EstadoReservaBadge estado={reserva.estado} /> <strong>{reserva.codigo}</strong>
        <br />
        {reserva.cancha.nombre} · {formatFecha(reserva.fecha)}, {formatHora(reserva.horaInicio)} - {formatHora(reserva.horaFin)}
        <br />
        Cliente: {nombreCliente(reserva)}
        {reserva.celularClienteManual && <> · {reserva.celularClienteManual}</>}
        <br />
        Total {formatCOP(reserva.precioTotal)} · Pagado {formatCOP(reserva.totalPagado)} · Saldo {formatCOP(reserva.saldoPendiente)}
      </p>
      {reserva.motivoCancelacion && <p className="muted">Motivo de cancelación: {reserva.motivoCancelacion}</p>}
      {errorGeneral && <Alert tone="error">{mensajeError(errorGeneral)}</Alert>}

      {puedePagar && (
        <form onSubmit={enviarPago} noValidate className="form" aria-label="Registrar pago">
          <h3>Registrar pago</h3>
          <div className="form__row">
            <Select
              label="Tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value === 'abono' ? 'abono' : 'saldo')}
              options={[
                { valor: 'saldo', etiqueta: 'Saldo' },
                { valor: 'abono', etiqueta: 'Abono' },
              ]}
            />
            <Select
              label="Método"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value === 'transferencia' ? 'transferencia' : 'efectivo')}
              options={[
                { valor: 'efectivo', etiqueta: 'Efectivo' },
                { valor: 'transferencia', etiqueta: 'Transferencia' },
              ]}
            />
          </div>
          <div className="form__row">
            <Input
              label="Valor (opcional)"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              hint={`Si lo dejas vacío: ${tipo === 'saldo' ? `todo el saldo (${formatCOP(reserva.saldoPendiente)})` : `el abono requerido (${formatCOP(reserva.abonoRequerido)})`}.`}
              error={detalle(pago.error, 'valor')}
            />
            <Input label="Referencia (opcional)" value={referencia} maxLength={80} onChange={(e) => setReferencia(e.target.value)} error={detalle(pago.error, 'referencia')} />
          </div>
          <Button type="submit" loading={pago.isPending}>
            Registrar pago
          </Button>
        </form>
      )}

      {activa && (
        <section className="stack stack--wide" aria-label="Asistencia">
          <h3>Asistencia</h3>
          {iniciada ? (
            <div className="row-actions">
              <Button variant="secondary" loading={estado.isPending && estado.variables === 'completada'} onClick={() => estado.mutate('completada')}>
                Marcar completada
              </Button>
              <Button variant="secondary" loading={estado.isPending && estado.variables === 'no_asistio'} onClick={() => estado.mutate('no_asistio')}>
                No asistió
              </Button>
            </div>
          ) : (
            <p className="muted">Podrás marcar la asistencia cuando empiece el partido.</p>
          )}
        </section>
      )}

      {activa && !iniciada && <MoverReserva reserva={reserva} complejoId={complejoId} onCerrar={onCerrar} />}

      {activa && !iniciada && (
        <form onSubmit={enviarCancelar} noValidate className="form" aria-label="Cancelar reserva">
          <h3>Cancelar reserva</h3>
          <Input
            label="Motivo (obligatorio, se le informa al cliente)"
            value={motivo}
            maxLength={255}
            onChange={(e) => setMotivo(e.target.value)}
            error={errorMotivo ?? detalle(cancelar.error, 'motivo')}
            hint="Si cancela el complejo, se reembolsa el 100 %."
          />
          {cancelar.error && !detalle(cancelar.error, 'motivo') && <Alert tone="error">{mensajeError(cancelar.error)}</Alert>}
          <Button type="submit" variant="danger" loading={cancelar.isPending}>
            Cancelar reserva
          </Button>
        </form>
      )}
    </div>
  );
}

function ReservaManual({ complejoId, fecha }: { complejoId: number; fecha: string }) {
  const refrescar = useRefrescarComplejo(complejoId);
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState('');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [errorSlot, setErrorSlot] = useState<string | undefined>();

  const disp = useQuery({
    queryKey: ['disponibilidad-complejo', complejoId, fecha],
    queryFn: () => disponibilidadComplejo(complejoId, fecha),
    enabled: abierto,
  });
  const libres = (disp.data?.canchas ?? []).flatMap((c) =>
    c.franjas.filter((f) => f.estado === 'libre').map((f) => ({ canchaId: c.id, cancha: c.nombre, franja: f })),
  );

  const crear = useMutation({
    mutationFn: () => {
      const [canchaId, hora] = elegida.split('|');
      return crearReservaManual(complejoId, {
        canchaId: Number(canchaId),
        fecha,
        horaInicio: hora ?? '',
        nombreCliente: nombre.trim(),
        celularCliente: celular.trim(),
      });
    },
    onSuccess: (r) => {
      mostrar(`Reserva manual ${r.reserva.codigo} creada.`, 'success');
      setElegida('');
      setNombre('');
      setCelular('');
      setAbierto(false);
      refrescar();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!elegida) {
      setErrorSlot('Elige una franja libre.');
      return;
    }
    setErrorSlot(undefined);
    crear.mutate();
  }

  if (!abierto) {
    return (
      <Button variant="secondary" onClick={() => setAbierto(true)}>
        Nueva reserva manual
      </Button>
    );
  }
  const errorGeneral = crear.error && !(crear.error instanceof ApiError && crear.error.detalles.length > 0) ? crear.error : null;
  return (
    <Card className="card--wide">
      <form onSubmit={enviar} noValidate className="form" aria-label="Nueva reserva manual">
        <h2>Nueva reserva manual</h2>
        <p className="muted">Para clientes que reservan por teléfono o en el mostrador. Fecha: {formatFecha(fecha)}.</p>
        {errorGeneral && <Alert tone="error">{mensajeError(errorGeneral)}</Alert>}
        {disp.isPending && <Spinner label="Buscando franjas…" />}
        {disp.isError && <Alert tone="error">{mensajeError(disp.error)}</Alert>}
        {disp.isSuccess && libres.length === 0 && <p className="muted">No hay franjas libres este día.</p>}
        {libres.length > 0 && (
          <fieldset className="slot-fieldset">
            <legend>Franja libre</legend>
            <ul className="slot-grid">
              {libres.map((l) => {
                const valor = `${l.canchaId}|${l.franja.horaInicio}`;
                return (
                  <li key={valor}>
                    <button type="button" className={`slot slot--libre${elegida === valor ? ' is-selected' : ''}`} aria-pressed={elegida === valor} onClick={() => setElegida(valor)}>
                      <span className="slot__time">{formatHora(l.franja.horaInicio)}</span>
                      <span className="slot__state">{l.cancha}</span>
                      <span className="slot__price">{l.franja.precio !== null ? formatCOP(l.franja.precio) : '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {errorSlot && <p className="field__error">{errorSlot}</p>}
          </fieldset>
        )}
        <div className="form__row">
          <Input label="Nombre del cliente" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} required error={detalle(crear.error, 'nombreCliente')} />
          <Input label="Celular del cliente" type="tel" inputMode="tel" value={celular} onChange={(e) => setCelular(e.target.value)} required error={detalle(crear.error, 'celularCliente')} />
        </div>
        <div className="row-actions">
          <Button type="submit" loading={crear.isPending}>
            Crear reserva
          </Button>
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function VenueBookingsPage() {
  const { id } = useParams();
  const complejoId = Number(id);
  const hoy = hoyBogota();
  const [fecha, setFecha] = useState(hoy);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);

  const consulta = useQuery({
    queryKey: ['calendario', complejoId, fecha],
    queryFn: () => calendarioComplejo(complejoId, fecha),
    enabled: Number.isInteger(complejoId) && complejoId > 0,
  });
  // Siempre se muestra la versión más reciente de la reserva abierta.
  const reserva = consulta.data?.reservas.find((r) => r.id === seleccionada) ?? null;

  return (
    <div className="page stack stack--wide">
      <p>
        <Link to={`/mis-complejos/${complejoId}`}>← Administrar complejo</Link>
      </p>
      <h1>Calendario de reservas</h1>
      <nav aria-label="Secciones de reservas" className="row-actions">
        <Link className="btn btn--secondary" to={`/mis-complejos/${complejoId}/pagos`}>
          Pagos
        </Link>
        <Link className="btn btn--secondary" to={`/mis-complejos/${complejoId}/reembolsos`}>
          Reembolsos
        </Link>
        <Link className="btn btn--secondary" to={`/mis-complejos/${complejoId}/inasistencias`}>
          Inasistencias reportadas
        </Link>
      </nav>
      <Input label="Fecha" type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
      <ReservaManual complejoId={complejoId} fecha={fecha} />

      {consulta.isPending && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {consulta.isSuccess && (
        <>
          {consulta.data.reservas.length === 0 && <p className="muted">No hay reservas el {formatFecha(fecha)}.</p>}
          <BookingCalendar canchas={consulta.data.canchas} reservas={consulta.data.reservas} onSeleccionar={(r) => setSeleccionada(r.id)} />
        </>
      )}

      <Modal
        abierto={reserva !== null}
        titulo="Reserva"
        onCerrar={() => setSeleccionada(null)}
        acciones={
          <Button variant="ghost" onClick={() => setSeleccionada(null)}>
            Cerrar
          </Button>
        }
      >
        {reserva && <AccionesReserva key={reserva.id} reserva={reserva} complejoId={complejoId} onCerrar={() => setSeleccionada(null)} />}
      </Modal>
    </div>
  );
}
