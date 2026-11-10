import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, Input, Modal, Select, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatCOP } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { pagarComoRival, resumenPagoPartido, retirarRival } from '../api';
import type { MetodoEnLinea, PagoEnLineaInput } from '../types';

interface Props {
  partidoId: number;
  /** Equipos que capitanea el usuario en sesión (para saber si puede pagar o retirarse). */
  equiposCapitaneadosIds: number[];
  nombreDueno: string;
  nombreRival: string | null;
  /** Estado del partido: el retiro solo aplica mientras el rival sigue confirmado. */
  estadoPartido: string;
}

const MENSAJES: Record<string, string> = {
  PLAZO_VENCIDO: 'El plazo para pagar el abono ya venció.',
  YA_PAGADO: 'Tu equipo ya pagó su parte.',
};

const METODOS: { id: MetodoEnLinea; texto: string }[] = [
  { id: 'tarjeta', texto: 'Tarjeta' },
  { id: 'pse', texto: 'PSE' },
  { id: 'nequi', texto: 'Nequi' },
];

function mensaje(err: unknown): string {
  if (err instanceof ApiError && MENSAJES[err.codigo]) return MENSAJES[err.codigo] as string;
  return mensajeError(err);
}

function fechaHora(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);
}

function useRefrescar(partidoId: number) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['resumen-pago', partidoId] }),
      qc.invalidateQueries({ queryKey: ['partido', partidoId] }),
      qc.invalidateQueries({ queryKey: ['partidos'] }),
      qc.invalidateQueries({ queryKey: ['mis-reservas'] }),
      qc.invalidateQueries({ queryKey: ['notificaciones'] }),
    ]);
}

function PagarAbonoDialog({ partidoId, abierto, pendiente, abono, onCerrar }: { partidoId: number; abierto: boolean; pendiente: number; abono: number; onCerrar: () => void }) {
  const refrescar = useRefrescar(partidoId);
  const [metodo, setMetodo] = useState<MetodoEnLinea>('tarjeta');
  const [monto, setMonto] = useState<'abono' | 'todo'>('abono');
  const [tarjeta, setTarjeta] = useState('');
  const [resultado, setResultado] = useState<'aprobado' | 'rechazado'>('aprobado');
  const [errorTarjeta, setErrorTarjeta] = useState<string | undefined>();

  const m = useMutation({
    mutationFn: (d: PagoEnLineaInput) => pagarComoRival(partidoId, d),
    onSuccess: async () => {
      await refrescar();
      onCerrar();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorTarjeta(undefined);
    const datos: NonNullable<PagoEnLineaInput['datos']> = {};
    if (metodo === 'tarjeta') {
      const digitos = tarjeta.replace(/\s/g, '');
      if (digitos.length < 12 || digitos.length > 19) {
        setErrorTarjeta('Ingresa un número de tarjeta de 12 a 19 dígitos.');
        return;
      }
      datos.numeroTarjeta = tarjeta.trim();
    } else {
      datos.resultado = resultado;
    }
    m.mutate({ metodo, datos, ...(monto === 'todo' ? { valor: pendiente } : {}) });
  }

  const valorAPagar = monto === 'todo' ? pendiente : Math.min(abono, pendiente);

  return (
    <Modal
      abierto={abierto}
      titulo="Pagar abono del partido"
      onCerrar={onCerrar}
      acciones={
        <>
          <Button variant="secondary" onClick={onCerrar}>
            Volver
          </Button>
          <Button type="submit" form="form-pago-rival" loading={m.isPending}>
            Pagar {formatCOP(valorAPagar)}
          </Button>
        </>
      }
    >
      <form id="form-pago-rival" className="form" onSubmit={enviar} noValidate aria-label="Pago del equipo rival">
        {m.isError && <Alert tone="error">{mensaje(m.error)}</Alert>}
        <fieldset className="radio-group">
          <legend>Método de pago</legend>
          {METODOS.map((x) => (
            <label key={x.id} className="radio-group__option">
              <input type="radio" name="metodo-rival" value={x.id} checked={metodo === x.id} onChange={() => setMetodo(x.id)} />
              {x.texto}
            </label>
          ))}
        </fieldset>
        {metodo === 'tarjeta' ? (
          <Input
            label="Número de tarjeta"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4242 4242 4242 4242"
            value={tarjeta}
            maxLength={23}
            onChange={(e) => setTarjeta(e.target.value.replace(/[^\d ]/g, ''))}
            error={errorTarjeta}
            hint="Ambiente de pruebas: una tarjeta que termina en 0002 es rechazada; cualquier otra se aprueba."
          />
        ) : (
          <Select
            label="Resultado simulado"
            value={resultado}
            onChange={(e) => setResultado(e.target.value === 'rechazado' ? 'rechazado' : 'aprobado')}
            options={[
              { valor: 'aprobado', etiqueta: 'Aprobar' },
              { valor: 'rechazado', etiqueta: 'Rechazar' },
            ]}
            hint="Ambiente de pruebas: elige qué resultado devuelve la pasarela simulada."
          />
        )}
        <fieldset className="radio-group">
          <legend>¿Cuánto pagas ahora?</legend>
          <label className="radio-group__option">
            <input type="radio" name="monto-rival" checked={monto === 'abono'} onChange={() => setMonto('abono')} />
            Abono ({formatCOP(Math.min(abono, pendiente))})
          </label>
          {pendiente > abono && (
            <label className="radio-group__option">
              <input type="radio" name="monto-rival" checked={monto === 'todo'} onChange={() => setMonto('todo')} />
              Toda mi parte ({formatCOP(pendiente)})
            </label>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

function RetirarDialog({ partidoId, abierto, onCerrar }: { partidoId: number; abierto: boolean; onCerrar: () => void }) {
  const refrescar = useRefrescar(partidoId);
  const { mostrar } = useToast();
  const m = useMutation({
    mutationFn: () => retirarRival(partidoId),
    onSuccess: async (r) => {
      // El resumen desaparece al retirarse, así que el resultado se informa con un aviso.
      mostrar(
        `Tu equipo se retiró del partido.${r.valorReembolso > 0 ? ` Se solicitó el reembolso de ${formatCOP(r.valorReembolso)} (${r.porcentajeReembolso} %).` : ' No hay valor para reembolsar.'}${r.cancelacionTardia ? ' Quedó registrada una cancelación tardía.' : ''}`,
        'success',
      );
      onCerrar();
      await refrescar();
    },
  });
  return (
    <Modal
      abierto={abierto}
      titulo="Retirar equipo del partido"
      onCerrar={onCerrar}
      acciones={
        <>
          <Button variant="secondary" onClick={onCerrar}>
            Volver
          </Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
            Confirmar retiro
          </Button>
        </>
      }
    >
      <div className="stack">
        <p>El partido volverá a quedar abierto para otros equipos y tu equipo dejará de ser el rival.</p>
        <Alert tone="warning">Si faltan menos de 6 horas para el partido, pierdes el abono y queda una marca de cancelación tardía para tu equipo.</Alert>
        {m.isError && <Alert tone="error">{mensaje(m.error)}</Alert>}
      </div>
    </Modal>
  );
}

/** HU-26: resumen del pago dividido entre los dos equipos de un partido con reserva. */
export function SplitPaymentSummary({ partidoId, equiposCapitaneadosIds, nombreDueno, nombreRival, estadoPartido }: Props) {
  const [pagando, setPagando] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const consulta = useQuery({
    queryKey: ['resumen-pago', partidoId],
    queryFn: () => resumenPagoPartido(partidoId),
    retry: false,
  });

  if (consulta.isPending) return <Spinner label="Cargando pago del partido…" />;
  if (consulta.isError) {
    // Sin pago dividido (faltan jugadores, sin reserva) o tercero sin acceso: no se muestra la sección.
    if (consulta.error instanceof ApiError && (consulta.error.codigo === 'SIN_PAGO_DIVIDIDO' || consulta.error.status === 403 || consulta.error.status === 409)) return null;
    return <Alert tone="error">{mensajeError(consulta.error)}</Alert>;
  }

  const r = consulta.data;
  const rival = r.equipoRival;
  const soyRival = rival !== null && equiposCapitaneadosIds.includes(rival.equipoId);
  const pendienteRival = rival ? Math.max(rival.parte - rival.pagado, 0) : 0;
  const abonoPendiente = rival ? Math.max(Math.min(rival.abono, rival.parte) - rival.pagado, 0) : 0;
  const puedePagar = soyRival && pendienteRival > 0 && estadoPartido !== 'cancelado' && estadoPartido !== 'jugado';
  const puedeRetirar = soyRival && (estadoPartido === 'rival_confirmado' || estadoPartido === 'completo');

  return (
    <Card className="stack">
      <h2>Pago del partido</h2>
      <dl className="summary-list">
        <div>
          <dt>Valor de la cancha</dt>
          <dd>{formatCOP(r.precioTotal)}</dd>
        </div>
        <div>
          <dt>Total pagado</dt>
          <dd>{formatCOP(r.totalPagado)}</dd>
        </div>
        <div>
          <dt>Saldo pendiente</dt>
          <dd>{formatCOP(r.saldoPendiente)}</dd>
        </div>
      </dl>

      <h3>{nombreDueno} (dueño de la reserva)</h3>
      <p>
        Parte: <strong>{formatCOP(r.equipoDueno.parte)}</strong> · Pagado: <strong>{formatCOP(r.equipoDueno.pagado)}</strong>
      </p>

      {rival ? (
        <>
          <h3>{nombreRival ?? 'Equipo rival'}</h3>
          <p>
            Parte: <strong>{formatCOP(rival.parte)}</strong> · Abono: <strong>{formatCOP(rival.abono)}</strong> · Pagado: <strong>{formatCOP(rival.pagado)}</strong>
          </p>
          {rival.limitePago && rival.pagado < rival.abono && (estadoPartido === 'rival_confirmado' || estadoPartido === 'completo') && (
            <Alert tone={new Date(rival.limitePago).getTime() < Date.now() ? 'error' : 'warning'}>
              {new Date(rival.limitePago).getTime() < Date.now() ? 'El plazo de pago del rival venció el ' : 'Plazo para pagar el abono: hasta el '}
              {fechaHora(rival.limitePago)}.
            </Alert>
          )}
          {rival.pagado >= rival.parte && <Alert tone="success">El equipo rival ya pagó su parte.</Alert>}
          {(puedePagar || puedeRetirar) && (
            <div className="row-actions">
              {puedePagar && <Button onClick={() => setPagando(true)}>Pagar abono</Button>}
              {puedeRetirar && (
                <Button variant="danger" onClick={() => setRetirando(true)}>
                  Retirar equipo
                </Button>
              )}
            </div>
          )}
          {puedePagar && <PagarAbonoDialog partidoId={partidoId} abierto={pagando} pendiente={pendienteRival} abono={abonoPendiente || pendienteRival} onCerrar={() => setPagando(false)} />}
          {puedeRetirar && <RetirarDialog partidoId={partidoId} abierto={retirando} onCerrar={() => setRetirando(false)} />}
        </>
      ) : (
        <p className="muted">Aún no hay equipo rival confirmado.</p>
      )}
    </Card>
  );
}
