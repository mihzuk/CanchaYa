import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Input, Modal, Select, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatFecha } from '../../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { partidosDeEquipo } from '../../matchmaking/api';
import { OpenMatchCard } from '../../matchmaking/components/OpenMatchCard';
import { mensajeError } from '../../venues/utils';
import {
  actualizarEquipo,
  expulsarMiembro,
  generarEnlace,
  invitacionesDeEquipo,
  invitarUsuario,
  obtenerEquipo,
  proponerCapitania,
  responderCapitania,
  revocarInvitacion,
  salirDelEquipo,
} from '../api';
import { errorDeCampo } from '../errors';
import { NIVELES_EQUIPO, etiquetaNivel } from '../types';
import type { Equipo, Miembro, NivelEquipo } from '../types';

function invalidarEquipo(qc: ReturnType<typeof useQueryClient>, id: number) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['equipo', id] }),
    qc.invalidateQueries({ queryKey: ['mis-equipos'] }),
    qc.invalidateQueries({ queryKey: ['equipo-invitaciones', id] }),
  ]);
}

function EditarEquipo({ equipo }: { equipo: Equipo }) {
  const qc = useQueryClient();
  const [nivel, setNivel] = useState<NivelEquipo>(equipo.nivel);
  const [escudoUrl, setEscudoUrl] = useState(equipo.escudoUrl ?? '');
  const [guardado, setGuardado] = useState(false);
  const m = useMutation({
    mutationFn: () => actualizarEquipo(equipo.id, { nivel, escudoUrl: escudoUrl.trim() === '' ? null : escudoUrl.trim() }),
    onSuccess: async () => {
      setGuardado(true);
      await invalidarEquipo(qc, equipo.id);
    },
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardado(false);
    m.mutate();
  }
  return (
    <Card>
      <form className="form" onSubmit={enviar} aria-label="Editar equipo">
        <h2>Editar equipo</h2>
        {m.isError && !errorDeCampo(m.error, 'nivel') && !errorDeCampo(m.error, 'escudoUrl') && <Alert tone="error">{mensajeError(m.error)}</Alert>}
        {guardado && <Alert tone="success">Cambios guardados.</Alert>}
        <Select
          label="Nivel"
          value={nivel}
          onChange={(e) => setNivel(e.target.value as NivelEquipo)}
          options={NIVELES_EQUIPO.map((n) => ({ valor: n.valor, etiqueta: n.etiqueta }))}
          error={errorDeCampo(m.error, 'nivel')}
        />
        <Input label="Escudo (https)" type="url" value={escudoUrl} onChange={(e) => setEscudoUrl(e.target.value)} error={errorDeCampo(m.error, 'escudoUrl')} />
        <Button type="submit" loading={m.isPending}>
          Guardar cambios
        </Button>
      </form>
    </Card>
  );
}

function Invitaciones({ equipo }: { equipo: Equipo }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [enviada, setEnviada] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const lista = useQuery({ queryKey: ['equipo-invitaciones', equipo.id], queryFn: () => invitacionesDeEquipo(equipo.id) });

  const invitar = useMutation({
    mutationFn: () => invitarUsuario(equipo.id, username.trim()),
    onSuccess: async () => {
      setEnviada(username.trim());
      setUsername('');
      await qc.invalidateQueries({ queryKey: ['equipo-invitaciones', equipo.id] });
    },
  });
  const enlace = useMutation({ mutationFn: () => generarEnlace(equipo.id) });
  const revocar = useMutation({
    mutationFn: (id: number) => revocarInvitacion(equipo.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipo-invitaciones', equipo.id] }),
  });

  const url = enlace.data ? `${window.location.origin}/unirse/${enlace.data.token}` : null;
  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }
  function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviada(null);
    if (username.trim().length >= 3) invitar.mutate();
  }

  const pendientes = (lista.data?.invitaciones ?? []).filter((i) => i.estado === 'pendiente');

  return (
    <Card className="stack stack--wide">
      <h2>Invitar jugadores</h2>
      <form className="form" onSubmit={enviar} aria-label="Invitar por nombre de usuario" noValidate>
        {invitar.isError && !errorDeCampo(invitar.error, 'username') && <Alert tone="error">{mensajeError(invitar.error)}</Alert>}
        {enviada && <Alert tone="success">Invitación enviada a @{enviada}.</Alert>}
        <Input
          label="Nombre de usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={30}
          error={errorDeCampo(invitar.error, 'username')}
        />
        <Button type="submit" loading={invitar.isPending} disabled={username.trim().length < 3}>
          Invitar
        </Button>
      </form>

      <div className="stack">
        <h3>Enlace de invitación</h3>
        {enlace.isError && <Alert tone="error">{mensajeError(enlace.error)}</Alert>}
        <div>
          <Button variant="secondary" onClick={() => { setCopiado(false); enlace.mutate(); }} loading={enlace.isPending}>
            Generar enlace
          </Button>
        </div>
        {url && enlace.data && (
          <div className="stack">
            <Alert tone="info">
              Este enlace se muestra una sola vez y es válido por {enlace.data.validoPorDias} {enlace.data.validoPorDias === 1 ? 'día' : 'días'}. Cópialo ahora.
            </Alert>
            <Input label="Enlace" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <div className="row-actions">
              <Button onClick={() => void copiar()}>Copiar enlace</Button>
              {copiado && <span role="status">¡Copiado!</span>}
            </div>
          </div>
        )}
      </div>

      <div className="stack">
        <h3>Invitaciones pendientes</h3>
        {lista.isPending && <Spinner />}
        {lista.isError && <Alert tone="error">{mensajeError(lista.error)}</Alert>}
        {revocar.isError && <Alert tone="error">{mensajeError(revocar.error)}</Alert>}
        {lista.isSuccess && pendientes.length === 0 && <p className="muted">No hay invitaciones pendientes.</p>}
        {pendientes.length > 0 && (
          <ul className="item-list">
            {pendientes.map((i) => (
              <li key={i.id} className="row-actions">
                <span>
                  {i.porEnlace ? 'Enlace de invitación' : `@${i.usuarioInvitado?.username ?? 'usuario'}`} · {formatFecha(i.fecha)}
                </span>
                <Button variant="ghost" onClick={() => revocar.mutate(i.id)} disabled={revocar.isPending}>
                  Revocar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Miembros({ equipo, miembros, esCapitan, yoId }: { equipo: Equipo; miembros: Miembro[]; esCapitan: boolean; yoId: number | null }) {
  const qc = useQueryClient();
  const [expulsando, setExpulsando] = useState<Miembro | null>(null);
  const expulsar = useMutation({
    mutationFn: (usuarioId: number) => expulsarMiembro(equipo.id, usuarioId),
    onSuccess: async () => {
      setExpulsando(null);
      await invalidarEquipo(qc, equipo.id);
    },
  });
  const proponer = useMutation({
    mutationFn: (usuarioId: number) => proponerCapitania(equipo.id, usuarioId),
    onSuccess: () => invalidarEquipo(qc, equipo.id),
  });

  return (
    <Card className="stack stack--wide">
      <h2>Miembros ({miembros.length})</h2>
      {proponer.isError && <Alert tone="error">{mensajeError(proponer.error)}</Alert>}
      {proponer.isSuccess && <Alert tone="success">Propuesta enviada. El jugador debe aceptar la capitanía.</Alert>}
      <ul className="item-list">
        {miembros.map((m) => (
          <li key={m.usuarioId} className="row-actions">
            <span>
              {m.username ? <Link to={`/jugadores/${m.username}`}>{m.nombre ?? m.username}</Link> : (m.nombre ?? 'Jugador')}
              {m.username && <span className="muted"> @{m.username}</span>}{' '}
              {m.rolEnEquipo === 'capitan' ? <Badge tone="info">Capitán</Badge> : null}
              {equipo.capitanPropuestoId === m.usuarioId && <Badge tone="warning">Capitanía propuesta</Badge>}
              <span className="muted"> · desde {formatFecha(m.fechaIngreso)}</span>
            </span>
            {esCapitan && m.usuarioId !== yoId && (
              <span className="row-actions">
                <Button
                  variant="secondary"
                  onClick={() => proponer.mutate(m.usuarioId)}
                  disabled={proponer.isPending || equipo.capitanPropuestoId !== null}
                  aria-label={`Proponer capitanía a ${m.nombre ?? m.username ?? 'jugador'}`}
                >
                  Proponer capitanía
                </Button>
                <Button variant="danger" onClick={() => { expulsar.reset(); setExpulsando(m); }} aria-label={`Expulsar a ${m.nombre ?? m.username ?? 'jugador'}`}>
                  Expulsar
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <Modal
        abierto={expulsando !== null}
        titulo="Expulsar miembro"
        onCerrar={() => setExpulsando(null)}
        acciones={
          <>
            <Button variant="secondary" onClick={() => setExpulsando(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={expulsar.isPending} onClick={() => expulsando && expulsar.mutate(expulsando.usuarioId)}>
              Expulsar
            </Button>
          </>
        }
      >
        <p>
          ¿Seguro que quieres expulsar a <strong>{expulsando?.nombre ?? expulsando?.username}</strong> del equipo?
        </p>
        <p className="muted">Los enlaces de invitación existentes se revocan; deberás generar uno nuevo.</p>
        {expulsar.isError && <Alert tone="error">{mensajeError(expulsar.error)}</Alert>}
      </Modal>
    </Card>
  );
}

function Salir({ equipo }: { equipo: Equipo }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const unico = equipo.totalMiembros <= 1;
  const m = useMutation({
    mutationFn: () => salirDelEquipo(equipo.id),
    onSuccess: async () => {
      setAbierto(false);
      await invalidarEquipo(qc, equipo.id);
      void navigate('/mis-equipos');
    },
  });
  const cedeCapitania = m.error instanceof ApiError && m.error.codigo === 'CAPITAN_DEBE_CEDER';
  return (
    <>
      <div>
        <Button variant="danger" onClick={() => { m.reset(); setAbierto(true); }}>
          Salir del equipo
        </Button>
      </div>
      <Modal
        abierto={abierto}
        titulo="Salir del equipo"
        onCerrar={() => setAbierto(false)}
        acciones={
          <>
            <Button variant="secondary" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
              Salir
            </Button>
          </>
        }
      >
        <p>¿Seguro que quieres salir de {equipo.nombre}?</p>
        {unico && <Alert tone="warning">Eres el único miembro: al salir, el equipo quedará inactivo.</Alert>}
        {m.isError && <Alert tone="error">{cedeCapitania ? 'Eres el capitán: antes de salir debes ceder la capitanía a otro miembro.' : mensajeError(m.error)}</Alert>}
      </Modal>
    </>
  );
}

function Capitania({ equipo }: { equipo: Equipo }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (aceptar: boolean) => responderCapitania(equipo.id, aceptar),
    onSuccess: () => invalidarEquipo(qc, equipo.id),
  });
  return (
    <section className="banner stack" aria-label="Propuesta de capitanía">
      <p>
        <strong>Te propusieron como capitán de {equipo.nombre}.</strong> ¿Aceptas?
      </p>
      {m.isError && <Alert tone="error">{mensajeError(m.error)}</Alert>}
      <div className="row-actions">
        <Button onClick={() => m.mutate(true)} loading={m.isPending && m.variables === true} disabled={m.isPending}>
          Aceptar capitanía
        </Button>
        <Button variant="secondary" onClick={() => m.mutate(false)} loading={m.isPending && m.variables === false} disabled={m.isPending}>
          Rechazar
        </Button>
      </div>
    </section>
  );
}

function PartidosDelEquipo({ equipoId }: { equipoId: number }) {
  const consulta = useQuery({ queryKey: ['equipo-partidos', equipoId], queryFn: () => partidosDeEquipo(equipoId) });
  return (
    <section className="stack stack--wide" aria-labelledby="titulo-partidos-equipo">
      <h2 id="titulo-partidos-equipo">Partidos del equipo</h2>
      {consulta.isPending && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {consulta.isSuccess && consulta.data.partidos.length === 0 && <p className="muted">Este equipo aún no tiene partidos publicados.</p>}
      {consulta.isSuccess && consulta.data.partidos.length > 0 && (
        <ul className="card-grid">
          {consulta.data.partidos.map((p) => (
            <li key={p.id}>
              <OpenMatchCard partido={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TeamPage() {
  const { id } = useParams();
  const equipoId = Number(id);
  const idValido = /^\d+$/.test(id ?? '') && equipoId > 0;
  const { usuario } = useAuth();
  const consulta = useQuery({ queryKey: ['equipo', equipoId], queryFn: () => obtenerEquipo(equipoId), enabled: idValido, retry: false });

  if (!idValido || (consulta.isError && consulta.error instanceof ApiError && consulta.error.status === 404)) {
    return (
      <div className="page page--narrow stack">
        <h1>Equipo no encontrado</h1>
        <Alert tone="error">No encontramos ese equipo.</Alert>
        <Link className="btn btn--primary" to="/mis-equipos">
          Mis equipos
        </Link>
      </div>
    );
  }
  if (consulta.isPending) return <Spinner />;
  if (consulta.isError) {
    return (
      <div className="page page--narrow stack">
        <h1>No pudimos cargar el equipo</h1>
        <Alert tone="error">{mensajeError(consulta.error)}</Alert>
      </div>
    );
  }

  const { equipo, miembros, esMiembro, esCapitan } = consulta.data;
  const activo = equipo.estado === 'activo';
  const suspendido = equipo.suspendidoHasta !== null && new Date(equipo.suspendidoHasta).getTime() > Date.now();

  return (
    <div className="page stack stack--wide">
      <header className="profile-head">
        {equipo.escudoUrl && <img className="avatar" src={equipo.escudoUrl} alt={`Escudo de ${equipo.nombre}`} width={72} height={72} />}
        <div>
          <h1>{equipo.nombre}</h1>
          <p className="muted">
            Fútbol {equipo.tipoFutbol} · {etiquetaNivel(equipo.nivel)} · {equipo.totalMiembros} {equipo.totalMiembros === 1 ? 'miembro' : 'miembros'}
          </p>
          {equipo.estado === 'inactivo' && <Badge tone="neutral">Inactivo</Badge>}
        </div>
      </header>

      {suspendido && equipo.suspendidoHasta && (
        <Alert tone="warning">
          Este equipo está suspendido de Busca Partido hasta el {formatFecha(equipo.suspendidoHasta)} por inasistencias.
        </Alert>
      )}
      {!activo && <Alert tone="info">Este equipo está inactivo.</Alert>}
      {activo && usuario && equipo.capitanPropuestoId === usuario.id && <Capitania equipo={equipo} />}

      <Miembros equipo={equipo} miembros={miembros} esCapitan={esCapitan && activo} yoId={usuario?.id ?? null} />
      {activo && esCapitan && <EditarEquipo equipo={equipo} />}
      {activo && esCapitan && <Invitaciones equipo={equipo} />}
      {esMiembro && <PartidosDelEquipo equipoId={equipo.id} />}
      {activo && esMiembro && <Salir equipo={equipo} />}
    </div>
  );
}
