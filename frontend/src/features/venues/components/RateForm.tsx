import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, Input, Select, Spinner, useToast } from '../../../components/ui';
import { formatCOP, formatHora } from '../../../lib/format';
import { actualizarTarifa, crearTarifa, eliminarTarifa, listarTarifas } from '../api';
import type { Cancha, Tarifa, TipoDia } from '../types';
import { aMinutos, mensajeError, opcionesHora } from '../utils';

const TIPOS_DIA: { valor: TipoDia; etiqueta: string }[] = [
  { valor: 'semana', etiqueta: 'Entre semana' },
  { valor: 'fin_semana_festivo', etiqueta: 'Fin de semana y festivos' },
];

export function RateForm({ cancha }: { cancha: Cancha }) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const clave = ['tarifas', cancha.id];
  const consulta = useQuery({ queryKey: clave, queryFn: () => listarTarifas(cancha.id) });

  const [editando, setEditando] = useState<number | null>(null);
  const [tipoDia, setTipoDia] = useState<TipoDia>('semana');
  const [inicio, setInicio] = useState('08:00');
  const [fin, setFin] = useState('22:00');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);

  function limpiar() {
    setEditando(null);
    setPrecio('');
    setError(null);
  }

  const guardar = useMutation({
    mutationFn: () => {
      const d = { tipoDia, horaInicio: inicio, horaFin: fin, precio: Number(precio) };
      return editando === null ? crearTarifa(cancha.id, d) : actualizarTarifa(editando, d);
    },
    onSuccess: () => {
      mostrar(editando === null ? 'Tarifa creada.' : 'Tarifa actualizada.', 'success');
      limpiar();
      void qc.invalidateQueries({ queryKey: clave });
      void qc.invalidateQueries({ queryKey: ['complejo'] });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarTarifa(id),
    onSuccess: () => {
      mostrar('Tarifa eliminada.', 'success');
      void qc.invalidateQueries({ queryKey: clave });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  function editar(t: Tarifa) {
    setEditando(t.id);
    setTipoDia(t.tipoDia);
    setInicio(formatHora(t.horaInicio));
    setFin(formatHora(t.horaFin));
    setPrecio(String(t.precio));
    setError(null);
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (aMinutos(fin) <= aMinutos(inicio)) {
      setError('La hora final debe ser posterior a la inicial.');
      return;
    }
    const p = Number(precio);
    if (!precio || !Number.isInteger(p) || p <= 0) {
      setError('Ingresa un precio entero en pesos, mayor que cero.');
      return;
    }
    guardar.mutate();
  }

  const activas = (consulta.data?.tarifas ?? []).filter((t) => t.activa);

  return (
    <div className="stack stack--wide">
      <Alert tone="info">Los cambios no afectan las reservas ya confirmadas.</Alert>
      <Card>
        <h2>Tarifas de {cancha.nombre}</h2>
        {consulta.isPending && <Spinner />}
        {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
        {consulta.isSuccess && activas.length === 0 && <p>Esta cancha aún no tiene tarifas. Sin tarifa, sus turnos no se pueden reservar.</p>}
        {TIPOS_DIA.map((td) => {
          const items = activas.filter((t) => t.tipoDia === td.valor).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
          if (items.length === 0) return null;
          return (
            <section key={td.valor}>
              <h3>{td.etiqueta}</h3>
              <ul className="item-list">
                {items.map((t) => (
                  <li key={t.id}>
                    <span>
                      {formatHora(t.horaInicio)} - {formatHora(t.horaFin)}: <strong>{formatCOP(t.precio)}</strong>
                    </span>
                    <span className="row-actions">
                      <Button variant="secondary" onClick={() => editar(t)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        loading={borrar.isPending && borrar.variables === t.id}
                        onClick={() => {
                          if (window.confirm('¿Eliminar esta tarifa?')) borrar.mutate(t.id);
                        }}
                      >
                        Eliminar
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Card>
      <Card>
        <form onSubmit={enviar} noValidate className="form">
          <h3>{editando === null ? 'Nueva tarifa' : 'Editar tarifa'}</h3>
          {error && <Alert tone="error">{error}</Alert>}
          <Select label="Tipo de día" value={tipoDia} onChange={(e) => setTipoDia(e.target.value as TipoDia)} options={TIPOS_DIA.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))} />
          <div className="form__row">
            <Select label="Desde" value={inicio} onChange={(e) => setInicio(e.target.value)} options={opcionesHora(false, inicio)} />
            <Select label="Hasta" value={fin} onChange={(e) => setFin(e.target.value)} options={opcionesHora(true, fin)} />
          </div>
          <Input label="Precio por turno (COP)" type="number" inputMode="numeric" min={1} step={1000} value={precio} onChange={(e) => setPrecio(e.target.value)} hint="Pesos colombianos, sin puntos ni comas." />
          <div className="row-actions">
            <Button type="submit" loading={guardar.isPending}>
              {editando === null ? 'Crear tarifa' : 'Guardar cambios'}
            </Button>
            {editando !== null && (
              <Button variant="ghost" onClick={limpiar}>
                Cancelar edición
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
