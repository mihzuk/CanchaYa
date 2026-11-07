import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, Input, Select, useToast } from '../../../components/ui';
import { formatFecha, formatHora, hoyBogota } from '../../../lib/format';
import { eliminarHorarioEspecial, guardarHorarioEspecial, guardarHorarios } from '../api';
import type { DiaHorario, Horario, ReservaActiva, ResultadoHorarios } from '../types';
import { aMinutos, DIAS_SEMANA, mensajeError, opcionesHora } from '../utils';

interface ScheduleFormProps {
  complejoId: number;
  horarios: Horario[];
}

interface SubFormProps extends ScheduleFormProps {
  onResultado: (r: ResultadoHorarios) => void;
}

interface FilaDia {
  abierto: boolean;
  apertura: string;
  cierre: string;
  duracion: string;
}

function filasIniciales(horarios: Horario[]): FilaDia[] {
  return DIAS_SEMANA.map((_, i) => {
    const h = horarios.find((x) => x.diaSemana === i + 1);
    return h
      ? { abierto: true, apertura: formatHora(h.horaApertura), cierre: formatHora(h.horaCierre), duracion: String(h.duracionTurnoMin) }
      : { abierto: false, apertura: '08:00', cierre: '22:00', duracion: '60' };
  });
}

function validarTurno(apertura: string, cierre: string, duracion: string): string | null {
  const d = Number(duracion);
  if (!Number.isInteger(d) || d < 30 || d > 180) return 'La duración del turno debe estar entre 30 y 180 minutos.';
  if (aMinutos(cierre) <= aMinutos(apertura)) return 'La hora de cierre debe ser posterior a la de apertura.';
  return null;
}

function Advertencias({ reservas }: { reservas: ReservaActiva[] }) {
  if (reservas.length === 0) return null;
  return (
    <Alert tone="warning">
      <div>
        <p>
          <strong>Estas reservas quedaron fuera del nuevo horario y no se eliminaron:</strong>
        </p>
        <ul>
          {reservas.map((r) => (
            <li key={r.id}>
              {r.codigo}: {formatFecha(r.fecha)}, {formatHora(r.horaInicio)} - {formatHora(r.horaFin)}
            </li>
          ))}
        </ul>
      </div>
    </Alert>
  );
}

function TablaSemanal({ complejoId, horarios, onResultado }: SubFormProps) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [filas, setFilas] = useState<FilaDia[]>(() => filasIniciales(horarios));
  const [error, setError] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: (dias: DiaHorario[]) => guardarHorarios(complejoId, dias),
    onSuccess: (r) => {
      mostrar('Horario semanal guardado.', 'success');
      onResultado(r);
      void qc.invalidateQueries({ queryKey: ['complejo', complejoId] });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  function cambiar(i: number, parcial: Partial<FilaDia>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...parcial } : f)));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const dias: DiaHorario[] = [];
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (!f || !f.abierto) continue;
      const msg = validarTurno(f.apertura, f.cierre, f.duracion);
      if (msg) {
        setError(`${DIAS_SEMANA[i] ?? 'Día'}: ${msg}`);
        return;
      }
      dias.push({ diaSemana: i + 1, horaApertura: f.apertura, horaCierre: f.cierre, duracionTurnoMin: Number(f.duracion) });
    }
    mutacion.mutate(dias);
  }

  return (
    <Card>
      <h2>Horario semanal</h2>
      <p className="muted">Los días que no marques como abiertos se consideran cerrados.</p>
      <form onSubmit={enviar} noValidate className="form">
        {error && <Alert tone="error">{error}</Alert>}
        {filas.map((f, i) => {
          const dia = DIAS_SEMANA[i] ?? '';
          return (
            <fieldset key={dia} className="day-row">
              <legend>{dia}</legend>
              <div className="check">
                <label className="check__label">
                  <input type="checkbox" checked={f.abierto} onChange={(e) => cambiar(i, { abierto: e.target.checked })} />
                  <span>Abierto</span>
                </label>
              </div>
              {f.abierto && (
                <div className="day-row__fields">
                  <Select label="Apertura" value={f.apertura} onChange={(e) => cambiar(i, { apertura: e.target.value })} options={opcionesHora(false, f.apertura)} />
                  <Select label="Cierre" value={f.cierre} onChange={(e) => cambiar(i, { cierre: e.target.value })} options={opcionesHora(true, f.cierre)} />
                  <Input label="Duración del turno (min)" type="number" inputMode="numeric" min={30} max={180} step={15} value={f.duracion} onChange={(e) => cambiar(i, { duracion: e.target.value })} />
                </div>
              )}
            </fieldset>
          );
        })}
        <Button type="submit" loading={mutacion.isPending}>
          Guardar horario semanal
        </Button>
      </form>
    </Card>
  );
}

function FechasEspeciales({ complejoId, horarios, onResultado }: SubFormProps) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [fecha, setFecha] = useState('');
  const [apertura, setApertura] = useState('08:00');
  const [cierre, setCierre] = useState('22:00');
  const [duracion, setDuracion] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const especiales = horarios
    .filter((h) => h.fechaEspecial !== null)
    .sort((a, b) => (a.fechaEspecial ?? '').localeCompare(b.fechaEspecial ?? ''));

  const agregar = useMutation({
    mutationFn: () =>
      guardarHorarioEspecial(complejoId, { fecha, horaApertura: apertura, horaCierre: cierre, duracionTurnoMin: Number(duracion) }),
    onSuccess: (r) => {
      mostrar('Fecha especial guardada.', 'success');
      setFecha('');
      onResultado(r);
      void qc.invalidateQueries({ queryKey: ['complejo', complejoId] });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const quitar = useMutation({
    mutationFn: (f: string) => eliminarHorarioEspecial(complejoId, f),
    onSuccess: () => {
      mostrar('Fecha especial eliminada.', 'success');
      void qc.invalidateQueries({ queryKey: ['complejo', complejoId] });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError('Elige la fecha especial.');
      return;
    }
    const msg = validarTurno(apertura, cierre, duracion);
    if (msg) {
      setError(msg);
      return;
    }
    agregar.mutate();
  }

  return (
    <Card>
      <h2>Fechas especiales</h2>
      <p className="muted">Úsalas para festivos o eventos: reemplazan el horario semanal en esa fecha.</p>
      {especiales.length === 0 ? (
        <p>No hay fechas especiales registradas.</p>
      ) : (
        <ul className="item-list">
          {especiales.map((h) => (
            <li key={h.id}>
              <span>
                <strong>{formatFecha(h.fechaEspecial ?? '')}</strong>: {formatHora(h.horaApertura)} - {formatHora(h.horaCierre)} · turnos de{' '}
                {h.duracionTurnoMin} min
              </span>
              <Button
                variant="ghost"
                loading={quitar.isPending && quitar.variables === h.fechaEspecial}
                onClick={() => h.fechaEspecial && quitar.mutate(h.fechaEspecial)}
              >
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={enviar} noValidate className="form">
        <h3>Agregar fecha especial</h3>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form__row">
          <Input label="Fecha" type="date" min={hoyBogota()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Input label="Duración del turno (min)" type="number" inputMode="numeric" min={30} max={180} step={15} value={duracion} onChange={(e) => setDuracion(e.target.value)} />
        </div>
        <div className="form__row">
          <Select label="Apertura" value={apertura} onChange={(e) => setApertura(e.target.value)} options={opcionesHora(false, apertura)} />
          <Select label="Cierre" value={cierre} onChange={(e) => setCierre(e.target.value)} options={opcionesHora(true, cierre)} />
        </div>
        <Button type="submit" loading={agregar.isPending}>
          Agregar fecha especial
        </Button>
      </form>
    </Card>
  );
}

export function ScheduleForm({ complejoId, horarios }: ScheduleFormProps) {
  const [advertencias, setAdvertencias] = useState<ReservaActiva[]>([]);
  const clave = horarios
    .filter((h) => h.diaSemana !== null)
    .map((h) => `${h.diaSemana}${h.horaApertura}${h.horaCierre}${h.duracionTurnoMin}`)
    .join('|');
  const alResultado = (r: ResultadoHorarios) => setAdvertencias(r.advertencias.reservasFueraDeHorario);
  return (
    <div className="stack stack--wide">
      <Advertencias reservas={advertencias} />
      <TablaSemanal key={clave} complejoId={complejoId} horarios={horarios} onResultado={alResultado} />
      <FechasEspeciales complejoId={complejoId} horarios={horarios} onResultado={alResultado} />
    </div>
  );
}
