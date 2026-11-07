import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Input, Select, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { validarUrlHttps } from '../../auth/validation';
import { actualizarCancha, actualizarComplejo, agregarFoto, eliminarFoto, obtenerComplejo } from '../api';
import { BlockForm } from '../components/BlockForm';
import { CourtCard } from '../components/CourtCard';
import { CourtForm } from '../components/CourtForm';
import { RateForm } from '../components/RateForm';
import { ScheduleForm } from '../components/ScheduleForm';
import { VenueForm } from '../components/VenueForm';
import type { Cancha, Complejo } from '../types';
import { mensajeError } from '../utils';

type Pestana = 'datos' | 'canchas' | 'horarios' | 'tarifas' | 'bloqueos';
const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'datos', texto: 'Datos' },
  { id: 'canchas', texto: 'Canchas' },
  { id: 'horarios', texto: 'Horarios' },
  { id: 'tarifas', texto: 'Tarifas' },
  { id: 'bloqueos', texto: 'Bloqueos' },
];
const MAX_FOTOS = 10;

function Fotos({ complejo }: { complejo: Complejo }) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['complejo', complejo.id] });

  const agregar = useMutation({
    mutationFn: () => agregarFoto(complejo.id, url.trim()),
    onSuccess: () => {
      setUrl('');
      mostrar('Foto agregada.', 'success');
      void refrescar();
    },
    onError: (e) => setError(mensajeError(e)),
  });
  const quitar = useMutation({
    mutationFn: (fotoId: number) => eliminarFoto(complejo.id, fotoId),
    onSuccess: () => {
      mostrar('Foto eliminada.', 'success');
      void refrescar();
    },
    onError: (e) => setError(mensajeError(e)),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const u = url.trim();
    if (!u) {
      setError('Pega la dirección (URL) de la foto.');
      return;
    }
    const msg = validarUrlHttps(u);
    if (msg) {
      setError(msg);
      return;
    }
    agregar.mutate();
  }

  return (
    <Card>
      <h2>Fotos</h2>
      <p className="muted">
        Agrega hasta {MAX_FOTOS} fotos con su dirección https. Tienes {complejo.fotos.length} de {MAX_FOTOS}.
      </p>
      {complejo.fotos.length > 0 && (
        <ul className="photo-grid">
          {[...complejo.fotos]
            .sort((a, b) => a.orden - b.orden)
            .map((f, i) => (
              <li key={f.id}>
                <img src={f.url} alt={`Foto ${i + 1} de ${complejo.nombre}`} loading="lazy" referrerPolicy="no-referrer" />
                <Button
                  variant="secondary"
                  loading={quitar.isPending && quitar.variables === f.id}
                  onClick={() => quitar.mutate(f.id)}
                  aria-label={`Eliminar foto ${i + 1}`}
                >
                  Eliminar
                </Button>
              </li>
            ))}
        </ul>
      )}
      <form onSubmit={enviar} noValidate className="form">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Dirección de la foto (URL)" type="url" inputMode="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} disabled={complejo.fotos.length >= MAX_FOTOS} />
        <Button type="submit" loading={agregar.isPending} disabled={complejo.fotos.length >= MAX_FOTOS}>
          Agregar foto
        </Button>
      </form>
    </Card>
  );
}

function SeccionDatos({ complejo }: { complejo: Complejo }) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  return (
    <div className="stack stack--wide">
      <Card>
        <h2>Datos del complejo</h2>
        <VenueForm
          key={complejo.id}
          inicial={complejo}
          etiquetaEnvio="Guardar cambios"
          onEnviar={async (d) => (await actualizarComplejo(complejo.id, d)).complejo}
          onGuardado={() => {
            mostrar('Datos del complejo actualizados.', 'success');
            void qc.invalidateQueries({ queryKey: ['complejo', complejo.id] });
          }}
        />
      </Card>
      <Fotos complejo={complejo} />
    </div>
  );
}

function SeccionCanchas({ complejo, canchas }: { complejo: Complejo; canchas: Cancha[] }) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [editando, setEditando] = useState<Cancha | 'nueva' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alternar = useMutation({
    mutationFn: (c: Cancha) =>
      actualizarCancha(c.id, {
        nombre: c.nombre,
        tipoFutbol: c.tipoFutbol,
        superficie: c.superficie,
        techada: c.techada,
        iluminacion: c.iluminacion,
        capacidadJugadores: c.capacidadJugadores,
        estado: c.estado === 'activa' ? 'inactiva' : 'activa',
      }),
    onSuccess: (r) => {
      mostrar(r.cancha.estado === 'activa' ? 'Cancha activada.' : 'Cancha desactivada.', 'success');
      void qc.invalidateQueries({ queryKey: ['complejo', complejo.id] });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  return (
    <div className="stack stack--wide">
      <h2>Canchas</h2>
      <p className="muted">Una cancha inactiva no aparece en búsquedas pero conserva su historial.</p>
      {error && <Alert tone="error" onClose={() => setError(null)}>{error}</Alert>}
      {canchas.length === 0 && <p>Aún no has creado canchas.</p>}
      <ul className="card-grid">
        {canchas.map((c) => (
          <li key={c.id}>
            <CourtCard
              cancha={c}
              acciones={
                <>
                  <Button variant="secondary" onClick={() => setEditando(c)}>
                    Editar
                  </Button>
                  <Button variant="ghost" loading={alternar.isPending && alternar.variables?.id === c.id} onClick={() => alternar.mutate(c)}>
                    {c.estado === 'activa' ? 'Desactivar' : 'Activar'}
                  </Button>
                </>
              }
            />
          </li>
        ))}
      </ul>
      {editando === null ? (
        <Button onClick={() => setEditando('nueva')}>Agregar cancha</Button>
      ) : (
        <CourtForm
          key={editando === 'nueva' ? 'nueva' : editando.id}
          complejoId={complejo.id}
          {...(editando === 'nueva' ? {} : { cancha: editando })}
          onTerminar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function ElegirCancha({ canchas, children }: { canchas: Cancha[]; children: (c: Cancha) => React.ReactNode }) {
  const [elegida, setElegida] = useState<string>(canchas[0] ? String(canchas[0].id) : '');
  const cancha = canchas.find((c) => String(c.id) === elegida) ?? canchas[0];
  if (!cancha) return <Alert tone="info">Primero crea una cancha en la pestaña Canchas.</Alert>;
  return (
    <div className="stack stack--wide">
      <Select label="Cancha" value={String(cancha.id)} onChange={(e) => setElegida(e.target.value)} options={canchas.map((c) => ({ valor: String(c.id), etiqueta: `${c.nombre} (Fútbol ${c.tipoFutbol})` }))} />
      {children(cancha)}
    </div>
  );
}

export function ManageVenuePage() {
  const { id } = useParams();
  const complejoId = Number(id);
  const [pestana, setPestana] = useState<Pestana>('datos');

  const consulta = useQuery({
    queryKey: ['complejo', complejoId],
    queryFn: () => obtenerComplejo(complejoId),
    enabled: Number.isInteger(complejoId) && complejoId > 0,
  });

  if (consulta.isPending) return <Spinner />;
  if (consulta.isError) {
    const noExiste = consulta.error instanceof ApiError && consulta.error.status === 404;
    return (
      <div className="page stack">
        <h1>{noExiste ? 'Complejo no encontrado' : 'No pudimos cargar el complejo'}</h1>
        <p>{noExiste ? 'No existe o no tienes acceso a él.' : mensajeError(consulta.error)}</p>
        <Link className="btn btn--primary" to="/mis-complejos">
          Volver a mis complejos
        </Link>
      </div>
    );
  }

  const { complejo, canchas, horarios, esGestor } = consulta.data;
  if (!esGestor) {
    return (
      <div className="page stack">
        <h1>Acceso restringido (403)</h1>
        <p>No administras este complejo.</p>
        <Link className="btn btn--primary" to="/mis-complejos">
          Volver a mis complejos
        </Link>
      </div>
    );
  }

  return (
    <div className="page stack stack--wide">
      <p>
        <Link to="/mis-complejos">← Mis complejos</Link>
      </p>
      <h1>{complejo.nombre}</h1>
      {complejo.estado === 'pendiente' && <Alert tone="warning">Tu complejo está pendiente de aprobación. Aparecerá en las búsquedas cuando sea aprobado.</Alert>}
      {complejo.estado === 'rechazado' && (
        <Alert tone="error">
          Tu complejo fue rechazado{complejo.motivoRechazo ? `. Motivo: ${complejo.motivoRechazo}` : '.'}
        </Alert>
      )}
      {complejo.estado === 'activo' && <Badge tone="success">Activo</Badge>}

      <div role="tablist" aria-label="Secciones del complejo" className="tabs">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`tab-${p.id}`}
            aria-selected={pestana === p.id}
            aria-controls={`panel-${p.id}`}
            tabIndex={pestana === p.id ? 0 : -1}
            className={`tabs__tab${pestana === p.id ? ' is-active' : ''}`}
            onClick={() => setPestana(p.id)}
            onKeyDown={(e) => {
              const i = PESTANAS.findIndex((x) => x.id === pestana);
              const sig = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
              const destino = sig === null ? undefined : PESTANAS[(sig + PESTANAS.length) % PESTANAS.length];
              if (destino) {
                setPestana(destino.id);
                document.getElementById(`tab-${destino.id}`)?.focus();
              }
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="tabpanel">
        {pestana === 'datos' && <SeccionDatos complejo={complejo} />}
        {pestana === 'canchas' && <SeccionCanchas complejo={complejo} canchas={canchas} />}
        {pestana === 'horarios' && <ScheduleForm complejoId={complejo.id} horarios={horarios} />}
        {pestana === 'tarifas' && <ElegirCancha canchas={canchas}>{(c) => <RateForm key={c.id} cancha={c} />}</ElegirCancha>}
        {pestana === 'bloqueos' && <ElegirCancha canchas={canchas}>{(c) => <BlockForm key={c.id} cancha={c} />}</ElegirCancha>}
      </div>
    </div>
  );
}
