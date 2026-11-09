import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Input, Select } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatCOP } from '../../../lib/format';
import type { Reserva } from '../../bookings/types';
import { mensajeError } from '../../venues/utils';
import { pagarAbono } from '../api';
import type { MetodoEnLinea, PagoEnLineaInput } from '../types';

interface Props {
  reserva: Reserva;
  /** Tiempo agotado u otra causa que impide pagar. */
  deshabilitado: boolean;
  onPagado: (reserva: Reserva) => void;
}

const METODOS: { id: MetodoEnLinea; texto: string }[] = [
  { id: 'tarjeta', texto: 'Tarjeta' },
  { id: 'pse', texto: 'PSE' },
  { id: 'nequi', texto: 'Nequi' },
];

export function PaymentForm({ reserva, deshabilitado, onPagado }: Props) {
  const qc = useQueryClient();
  const [metodo, setMetodo] = useState<MetodoEnLinea>('tarjeta');
  const [monto, setMonto] = useState<'abono' | 'total'>('abono');
  const [tarjeta, setTarjeta] = useState('');
  const [resultado, setResultado] = useState<'aprobado' | 'rechazado'>('aprobado');
  const [errorTarjeta, setErrorTarjeta] = useState<string | undefined>();

  const pagar = useMutation({
    mutationFn: (d: PagoEnLineaInput) => pagarAbono(reserva.id, d),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['mis-reservas'] });
      void qc.invalidateQueries({ queryKey: ['reserva', reserva.id] });
      onPagado(r.reserva);
    },
  });

  const total = reserva.saldoPendiente;
  const abono = Math.min(Math.max(reserva.abonoRequerido - reserva.totalPagado, 0), total);
  const error = pagar.error;
  const detalle = (campo: string) =>
    error instanceof ApiError ? error.detalles.find((d) => d.campo === campo || d.campo.endsWith(`.${campo}`))?.mensaje : undefined;

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
    pagar.mutate({ metodo, datos, ...(monto === 'total' ? { valor: total } : {}) });
  }

  const codigo = error instanceof ApiError ? error.codigo : null;

  // PAGO_EN_CURSO: permitir reintentar tras unos segundos.
  const [espera, setEspera] = useState(false);
  useEffect(() => {
    if (codigo !== 'PAGO_EN_CURSO') return;
    setEspera(true);
    const t = window.setTimeout(() => setEspera(false), 5000);
    return () => window.clearTimeout(t);
  }, [codigo, pagar.submittedAt]);

  return (
    <form onSubmit={enviar} noValidate className="form" aria-label="Pago de la reserva">
      {error && (
        <Alert tone={codigo === 'PAGO_EN_CURSO' ? 'info' : 'error'}>
          {codigo === 'RESERVA_EXPIRADA' ? (
            <>
              {error.message} <Link to="/disponibilidad">Buscar otra cancha</Link>
            </>
          ) : codigo === 'PAGO_EN_CURSO' ? (
            <>{error.message} Podrás intentarlo de nuevo en unos segundos.</>
          ) : codigo === 'PASARELA_NO_DISPONIBLE' ? (
            <>{error.message} Puedes intentar de nuevo en un momento.</>
          ) : codigo === 'PAGO_RECHAZADO' ? (
            <>{error.message} Puedes intentar de nuevo.</>
          ) : (
            mensajeError(error)
          )}
        </Alert>
      )}

      <fieldset className="radio-group">
        <legend>Método de pago</legend>
        {METODOS.map((m) => (
          <label key={m.id} className="radio-group__option">
            <input type="radio" name="metodo" value={m.id} checked={metodo === m.id} onChange={() => setMetodo(m.id)} disabled={deshabilitado} />
            {m.texto}
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
          error={errorTarjeta ?? detalle('numeroTarjeta')}
          hint="Ambiente de pruebas: una tarjeta que termina en 0002 es rechazada; cualquier otra se aprueba."
          disabled={deshabilitado}
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
          disabled={deshabilitado}
        />
      )}

      <fieldset className="radio-group">
        <legend>¿Cuánto pagas ahora?</legend>
        <label className="radio-group__option">
          <input type="radio" name="monto" checked={monto === 'abono'} onChange={() => setMonto('abono')} disabled={deshabilitado} />
          Abono ({formatCOP(abono)})
        </label>
        {total > abono && (
          <label className="radio-group__option">
            <input type="radio" name="monto" checked={monto === 'total'} onChange={() => setMonto('total')} disabled={deshabilitado} />
            Total ({formatCOP(total)})
          </label>
        )}
        {detalle('valor') && <p className="field__error">{detalle('valor')}</p>}
      </fieldset>

      <Button type="submit" loading={pagar.isPending} disabled={deshabilitado || espera}>
        Pagar {formatCOP(monto === 'total' ? total : abono)}
      </Button>
    </form>
  );
}
