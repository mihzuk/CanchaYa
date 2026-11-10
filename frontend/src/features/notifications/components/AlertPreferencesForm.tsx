import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Badge, Button, Card, Input, Select, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { misEquipos } from '../../teams/api';
import { NIVELES_EQUIPO, etiquetaNivel } from '../../teams/types';
import type { NivelEquipo } from '../../teams/types';
import { DIAS_SEMANA, mensajeError } from '../../venues/utils';
import { actualizarPreferencia, crearPreferencia, eliminarPreferencia, listarPreferencias } from '../api';
import type { PreferenciaAlerta, PreferenciaAlertaInput, TipoFutbolAlerta } from '../types';

const TIPOS: TipoFutbolAlerta[] = [5, 6, 7, 8, 11];

interface Estado {
  equipoId: string;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  zona: string;
  nivel: string;
  tipoFutbol: string;
  activa: boolean;
}

const VACIO: Estado = { equipoId: '', dias: [], horaInicio: '18:00', horaFin: '22:00', zona: '', nivel: '', tipoFutbol: '', activa: true };

function aEstado(p: PreferenciaAlerta): Estado {
  return {
    equipoId: p.equipoId === null ? '' : String(p.equipoId),
    dias: p.dias,
    horaInicio: p.horaInicio.slice(0, 5),
    horaFin: p.horaFin.slice(0, 5),
    zona: p.zona ?? '',
    nivel: p.nivel ?? '',
    tipoFutbol: p.tipoFutbol === null ? '' : String(p.tipoFutbol),
    activa: p.activa,
  };
}

function aEntrada(e: Estado): PreferenciaAlertaInput {
  const zona = e.zona.trim();
  return {
    equipoId: e.equipoId === '' ? null : Number(e.equipoId),
    dias: [...e.dias].sort((a, b) => a - b),
    horaInicio: e.horaInicio,
    horaFin: e.horaFin,
    ...(zona ? { zona } : {}),
    nivel: e.nivel === '' ? null : (e.nivel as NivelEquipo),
    tipoFutbol: e.tipoFutbol === '' ? null : (Number(e.tipoFutbol) as TipoFutbolAlerta),
    activa: e.activa,
  };
}

function detalle(err: unknown, campo: string): string | undefined {
  return err instanceof ApiError ? err.detalles.find((d) => d.campo === campo)?.mensaje : undefined;
}

function resumen(p: PreferenciaAlerta, equipos: Map<number, string>): string {
  const dias = p.dias.map((d) => DIAS_SEMANA[d - 1]?.slice(0, 3) ?? String(d)).join(', ');
  const partes = [dias, `${p.horaInicio.slice(0, 5)} - ${p.horaFin.slice(0, 5)}`];
  if (p.zona) partes.push(`zona ${p.zona}`);
  if (p.nivel) partes.push(etiquetaNivel(p.nivel));
  if (p.tipoFutbol) partes.push(`fútbol ${p.tipoFutbol}`);
  if (p.equipoId !== null) partes.push(`equipo ${equipos.get(p.equipoId) ?? p.equipoId}`);
  return partes.join(' · ');
}

/** HU-29: CRUD de preferencias de alerta de partidos. */
export function AlertPreferencesForm() {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const { mostrar } = useToast();
  const [editando, setEditando] = useState<number | null>(null);
  const [f, setF] = useState<Estado>(VACIO);
  const [errorDias, setErrorDias] = useState<string | undefined>();

  const lista = useQuery({ queryKey: ['preferencias-alerta'], queryFn: listarPreferencias });
  const equiposQ = useQuery({ queryKey: ['mis-equipos'], queryFn: misEquipos });
  const capitaneados = (equiposQ.data?.equipos ?? []).filter((e) => e.capitanId === usuario?.id && e.estado === 'activo');
  const nombres = new Map((equiposQ.data?.equipos ?? []).map((e) => [e.id, e.nombre]));

  const refrescar = () => qc.invalidateQueries({ queryKey: ['preferencias-alerta'] });
  const guardar = useMutation({
    mutationFn: (d: PreferenciaAlertaInput) => (editando === null ? crearPreferencia(d) : actualizarPreferencia(editando, d)),
    onSuccess: async () => {
      mostrar(editando === null ? 'Alerta creada.' : 'Alerta actualizada.', 'success');
      setEditando(null);
      setF(VACIO);
      await refrescar();
    },
  });
  const borrar = useMutation({
    mutationFn: (id: number) => eliminarPreferencia(id),
    onSuccess: async (_r, id) => {
      mostrar('Alerta eliminada.', 'success');
      if (editando === id) {
        setEditando(null);
        setF(VACIO);
      }
      await refrescar();
    },
  });
  const alternar = useMutation({
    mutationFn: (p: PreferenciaAlerta) => actualizarPreferencia(p.id, aEntrada({ ...aEstado(p), activa: !p.activa })),
    onSuccess: refrescar,
  });

  function alternarDia(d: number) {
    setF((x) => ({ ...x, dias: x.dias.includes(d) ? x.dias.filter((v) => v !== d) : [...x.dias, d] }));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (f.dias.length === 0) {
      setErrorDias('Elige al menos un día.');
      return;
    }
    setErrorDias(undefined);
    guardar.mutate(aEntrada(f));
  }

  const errorGeneral = guardar.error && !(guardar.error instanceof ApiError && guardar.error.detalles.length > 0) ? guardar.error : null;
  const errorDiasTexto = errorDias ?? detalle(guardar.error, 'dias');
  const preferencias = lista.data?.preferencias ?? [];

  return (
    <div className="stack stack--wide">
      <Card className="stack stack--wide">
        <h2>Mis alertas</h2>
        {lista.isPending && <Spinner />}
        {lista.isError && <Alert tone="error">{mensajeError(lista.error)}</Alert>}
        {borrar.isError && <Alert tone="error">{mensajeError(borrar.error)}</Alert>}
        {alternar.isError && <Alert tone="error">{mensajeError(alternar.error)}</Alert>}
        {lista.isSuccess && preferencias.length === 0 && <p className="muted">Aún no tienes alertas. Crea una abajo y te avisaremos cuando se publique un partido que encaje.</p>}
        <ul className="item-list">
          {preferencias.map((p) => (
            <li key={p.id}>
              <span>
                {resumen(p, nombres)} <Badge tone={p.activa ? 'success' : 'neutral'}>{p.activa ? 'Activa' : 'Pausada'}</Badge>
              </span>
              <span className="row-actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    guardar.reset();
                    setEditando(p.id);
                    setF(aEstado(p));
                  }}
                >
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => alternar.mutate(p)} disabled={alternar.isPending}>
                  {p.activa ? 'Pausar' : 'Activar'}
                </Button>
                <Button variant="danger" onClick={() => borrar.mutate(p.id)} disabled={borrar.isPending}>
                  Eliminar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="card--wide">
        <form onSubmit={enviar} noValidate className="form" aria-label="Alerta de partidos">
          <h2>{editando === null ? 'Nueva alerta' : 'Editar alerta'}</h2>
          <p className="muted">Te avisamos cuando se publique un partido que coincida con estos criterios.</p>
          {errorGeneral && <Alert tone="error">{mensajeError(errorGeneral)}</Alert>}
          <fieldset className="radio-group">
            <legend>Días</legend>
            <div className="days-grid">
              {DIAS_SEMANA.map((nombre, i) => (
                <label key={nombre} className="radio-group__option">
                  <input type="checkbox" checked={f.dias.includes(i + 1)} onChange={() => alternarDia(i + 1)} />
                  {nombre}
                </label>
              ))}
            </div>
            {errorDiasTexto && <p className="field__error">{errorDiasTexto}</p>}
          </fieldset>
          <div className="form__row">
            <Input label="Hora desde" type="time" value={f.horaInicio} onChange={(e) => setF({ ...f, horaInicio: e.target.value })} required error={detalle(guardar.error, 'horaInicio')} />
            <Input label="Hora hasta" type="time" value={f.horaFin} onChange={(e) => setF({ ...f, horaFin: e.target.value })} required error={detalle(guardar.error, 'horaFin')} />
          </div>
          <Input label="Zona (opcional)" value={f.zona} maxLength={100} onChange={(e) => setF({ ...f, zona: e.target.value })} hint="Barrio o ciudad, por ejemplo Chapinero." error={detalle(guardar.error, 'zona')} />
          <div className="form__row">
            <Select label="Nivel" value={f.nivel} onChange={(e) => setF({ ...f, nivel: e.target.value })} placeholder="Cualquiera" options={NIVELES_EQUIPO.map((n) => ({ valor: n.valor, etiqueta: n.etiqueta }))} />
            <Select label="Modalidad" value={f.tipoFutbol} onChange={(e) => setF({ ...f, tipoFutbol: e.target.value })} placeholder="Cualquiera" options={TIPOS.map((t) => ({ valor: String(t), etiqueta: `Fútbol ${t}` }))} />
          </div>
          {capitaneados.length > 0 && (
            <Select
              label="Equipo (opcional)"
              value={f.equipoId}
              onChange={(e) => setF({ ...f, equipoId: e.target.value })}
              placeholder="Para mí, sin equipo"
              options={capitaneados.map((e) => ({ valor: String(e.id), etiqueta: e.nombre }))}
            />
          )}
          <div className="check">
            <label className="check__label">
              <input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} />
              <span>Alerta activa</span>
            </label>
          </div>
          <div className="row-actions">
            <Button type="submit" loading={guardar.isPending}>
              Guardar alerta
            </Button>
            {editando !== null && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditando(null);
                  setF(VACIO);
                  guardar.reset();
                }}
              >
                Cancelar edición
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
