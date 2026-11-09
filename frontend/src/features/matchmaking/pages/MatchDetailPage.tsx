import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Modal, Select, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatCOP, formatFecha, formatHora } from '../../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { misReservas } from '../../bookings/api';
import { misEquipos } from '../../teams/api';
import { etiquetaNivel } from '../../teams/types';
import type { Equipo } from '../../teams/types';
import { mensajeError } from '../../venues/utils';
import {
  aceptarConReserva,
  cancelarPartido,
  inscribirse,
  listarInscripciones,
  listarPostulaciones,
  obtenerPartido,
  postularEquipo,
  responderInscripcion,
  responderPostulacion,
  retirarInscripcion,
  retirarPostulacion,
} from '../api';
import { textoFairPlay } from '../components/OpenMatchCard';
import { ETIQUETA_ESTADO, POSICIONES, etiquetaModalidad } from '../types';
import type { DetallePartido, EquipoResumen, Partido, PosicionJugador } from '../types';

const MENSAJES: Record<string, string> = {
  CRUCE_DE_HORARIO: 'Tu equipo ya tiene otro partido o reserva en ese horario.',
  YA_POSTULADO: 'Tu equipo ya se postuló a este partido.',
  MISMO_EQUIPO: 'No puedes postular al mismo equipo que publicó el partido.',
  MODALIDAD_INCOMPATIBLE: 'Este partido no es compatible con tu equipo (tipo de fútbol o modalidad).',
  PARTIDO_CERRADO: 'Este partido ya no admite más participantes.',
  EQUIPO_SUSPENDIDO: 'Tu equipo está suspendido y no puede participar en partidos por ahora.',
  YA_INSCRITO: 'Ya pediste un cupo en este partido.',
  YA_ES_MIEMBRO: 'Ya eres miembro del equipo publicador.',
  RESERVA_FUERA_DE_RANGO: 'Tu reserva está fuera de la fecha u horario que busca el equipo.',
};

function mensajeAccion(err: unknown): string {
  if (err instanceof ApiError && MENSAJES[err.codigo]) return MENSAJES[err.codigo] as string;
  return mensajeError(err);
}

function EquipoLinea({ equipo }: { equipo: EquipoResumen }) {
  return (
    <p>
      <Link to={`/equipos/${equipo.id}`}>{equipo.nombre}</Link>
      <span className="muted">
        {' '}
        · {etiquetaNivel(equipo.nivel)} · Fútbol {equipo.tipoFutbol} · {textoFairPlay(equipo.fairPlay)}
      </span>
    </p>
  );
}

function useRefrescarPartido(id: number) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['partido', id] }),
      qc.invalidateQueries({ queryKey: ['partidos'] }),
      qc.invalidateQueries({ queryKey: ['postulaciones', id] }),
      qc.invalidateQueries({ queryKey: ['inscripciones', id] }),
      qc.invalidateQueries({ queryKey: ['mis-reservas'] }),
      qc.invalidateQueries({ queryKey: ['equipo-partidos'] }),
    ]);
}

function Postular({ partido, equipos }: { partido: Partido; equipos: Equipo[] }) {
  const refrescar = useRefrescarPartido(partido.id);
  const [equipoId, setEquipoId] = useState('');
  const m = useMutation({ mutationFn: () => postularEquipo(partido.id, Number(equipoId)), onSuccess: refrescar });
  return (
    <Card className="stack">
      <h2>Postular a mi equipo</h2>
      {m.isSuccess && (
        <Alert tone="success">{m.data.confirmado ? '¡Rival confirmado! Tu equipo jugará este partido.' : 'Postulación enviada. El capitán del equipo publicador la revisará.'}</Alert>
      )}
      {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      {equipos.length === 0 ? (
        <p>
          Necesitas ser capitán de un equipo para postular. <Link to="/equipos/crear">Crear equipo</Link>
        </p>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (equipoId !== '') m.mutate();
          }}
        >
          <Select
            label="Equipo"
            value={equipoId}
            onChange={(e) => setEquipoId(e.target.value)}
            placeholder="Elige tu equipo"
            options={equipos.map((e) => ({ valor: String(e.id), etiqueta: e.nombre }))}
          />
          <Button type="submit" loading={m.isPending} disabled={equipoId === '' || m.isSuccess}>
            Postular a mi equipo
          </Button>
        </form>
      )}
    </Card>
  );
}

function PedirCupo({ partido }: { partido: Partido }) {
  const refrescar = useRefrescarPartido(partido.id);
  const [posicion, setPosicion] = useState('');
  const m = useMutation({ mutationFn: () => inscribirse(partido.id, posicion === '' ? null : (posicion as PosicionJugador)), onSuccess: refrescar });
  return (
    <Card className="stack">
      <h2>Pedir un cupo</h2>
      <p>
        Quedan <strong>{partido.cuposDisponibles ?? 0}</strong> {partido.cuposDisponibles === 1 ? 'cupo' : 'cupos'}. Tu aporte sería de{' '}
        <strong>{formatCOP(partido.aportePorJugador ?? 0)}</strong>.
      </p>
      {m.isSuccess && (
        <Alert tone="success">
          Solicitud enviada con un aporte de {formatCOP(m.data.inscripcion.aporte ?? partido.aportePorJugador ?? 0)}. El capitán debe aceptarla.
        </Alert>
      )}
      {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Select label="Posición (opcional)" value={posicion} onChange={(e) => setPosicion(e.target.value)} placeholder="Cualquiera" options={POSICIONES} />
        <Button type="submit" loading={m.isPending} disabled={m.isSuccess}>
          Pedir un cupo
        </Button>
      </form>
    </Card>
  );
}

function AceptarConReserva({ partido, equipos }: { partido: Partido; equipos: Equipo[] }) {
  const refrescar = useRefrescarPartido(partido.id);
  const [equipoId, setEquipoId] = useState('');
  const [reservaId, setReservaId] = useState('');
  const reservas = useQuery({ queryKey: ['mis-reservas', 'proximas'], queryFn: () => misReservas('proximas') });
  const validas = (reservas.data?.reservas ?? []).filter((r) => r.estado === 'confirmada' || r.estado === 'pagada');
  const m = useMutation({ mutationFn: () => aceptarConReserva(partido.id, { equipoId: Number(equipoId), reservaId: Number(reservaId) }), onSuccess: refrescar });
  return (
    <Card className="stack">
      <h2>Aceptar con mi reserva</h2>
      <p className="muted">Si tu reserva queda dentro de la fecha y horas que busca este equipo, el partido se confirma.</p>
      {m.isSuccess && <Alert tone="success">¡Partido confirmado con tu reserva!</Alert>}
      {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      {reservas.isPending && <Spinner />}
      {equipos.length === 0 ? (
        <p>
          Necesitas ser capitán de un equipo. <Link to="/equipos/crear">Crear equipo</Link>
        </p>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (equipoId !== '' && reservaId !== '') m.mutate();
          }}
        >
          <Select
            label="Equipo"
            value={equipoId}
            onChange={(e) => setEquipoId(e.target.value)}
            placeholder="Elige tu equipo"
            options={equipos.map((e) => ({ valor: String(e.id), etiqueta: e.nombre }))}
          />
          <Select
            label="Reserva confirmada"
            value={reservaId}
            onChange={(e) => setReservaId(e.target.value)}
            placeholder="Elige tu reserva"
            options={validas.map((r) => ({ valor: String(r.id), etiqueta: `${r.complejo.nombre} · ${formatFecha(r.fecha)} ${formatHora(r.horaInicio)}` }))}
            hint={reservas.isSuccess && validas.length === 0 ? 'No tienes reservas confirmadas próximas.' : undefined}
          />
          <Button type="submit" loading={m.isPending} disabled={equipoId === '' || reservaId === '' || m.isSuccess}>
            Aceptar con mi reserva
          </Button>
        </form>
      )}
    </Card>
  );
}

function PanelPostulaciones({ partido }: { partido: Partido }) {
  const refrescar = useRefrescarPartido(partido.id);
  const consulta = useQuery({ queryKey: ['postulaciones', partido.id], queryFn: () => listarPostulaciones(partido.id) });
  const m = useMutation({ mutationFn: (v: { id: number; aceptar: boolean }) => responderPostulacion(v.id, v.aceptar), onSuccess: refrescar });
  const pendientes = (consulta.data?.postulaciones ?? []).filter((p) => p.estado === 'pendiente');
  return (
    <Card className="stack">
      <h2>Postulaciones</h2>
      {consulta.isPending && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      {consulta.isSuccess && pendientes.length === 0 && <p className="muted">No hay postulaciones pendientes.</p>}
      <ul className="item-list">
        {pendientes.map((p) => (
          <li key={p.id} className="stack">
            <EquipoLinea equipo={p.equipo} />
            <div className="row-actions">
              <Button onClick={() => m.mutate({ id: p.id, aceptar: true })} disabled={m.isPending || partido.estado !== 'buscando'}>
                Aceptar
              </Button>
              <Button variant="secondary" onClick={() => m.mutate({ id: p.id, aceptar: false })} disabled={m.isPending}>
                Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PanelInscripciones({ partido }: { partido: Partido }) {
  const refrescar = useRefrescarPartido(partido.id);
  const consulta = useQuery({ queryKey: ['inscripciones', partido.id], queryFn: () => listarInscripciones(partido.id) });
  const m = useMutation({ mutationFn: (v: { id: number; aceptar: boolean }) => responderInscripcion(v.id, v.aceptar), onSuccess: refrescar });
  const pendientes = (consulta.data?.inscripciones ?? []).filter((i) => i.estado === 'pendiente');
  const aceptadas = (consulta.data?.inscripciones ?? []).filter((i) => i.estado === 'aceptada');
  return (
    <Card className="stack">
      <h2>Solicitudes de cupo</h2>
      {consulta.isPending && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      {consulta.isSuccess && pendientes.length === 0 && <p className="muted">No hay solicitudes pendientes.</p>}
      <ul className="item-list">
        {pendientes.map((i) => (
          <li key={i.id} className="stack">
            <p>
              {i.jugador.username ? <Link to={`/jugadores/${i.jugador.username}`}>{i.jugador.nombre ?? i.jugador.username}</Link> : (i.jugador.nombre ?? 'Jugador')}
              {i.posicion && <span className="muted"> · {POSICIONES.find((p) => p.valor === i.posicion)?.etiqueta ?? i.posicion}</span>}
            </p>
            <div className="row-actions">
              <Button onClick={() => m.mutate({ id: i.id, aceptar: true })} disabled={m.isPending || (partido.cuposDisponibles ?? 0) < 1}>
                Aceptar
              </Button>
              <Button variant="secondary" onClick={() => m.mutate({ id: i.id, aceptar: false })} disabled={m.isPending}>
                Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {aceptadas.length > 0 && (
        <>
          <h3>Jugadores aceptados</h3>
          <ul className="item-list">
            {aceptadas.map((i) => (
              <li key={i.id}>{i.jugador.nombre ?? i.jugador.username ?? 'Jugador'}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

const ETIQUETA_SOLICITUD = { pendiente: 'pendiente de respuesta', aceptada: 'aceptada', rechazada: 'rechazada' } as const;

function MiPostulacion({ partido, mia }: { partido: Partido; mia: NonNullable<DetallePartido['miPostulacion']> }) {
  const refrescar = useRefrescarPartido(partido.id);
  const m = useMutation({ mutationFn: () => retirarPostulacion(mia.id), onSuccess: refrescar });
  return (
    <Card className="stack">
      <h2>Mi postulación</h2>
      <p>
        Tu postulación está <strong>{ETIQUETA_SOLICITUD[mia.estado]}</strong>.
      </p>
      {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      {mia.estado === 'pendiente' && (
        <div>
          <Button variant="secondary" loading={m.isPending} onClick={() => m.mutate()}>
            Retirar solicitud
          </Button>
        </div>
      )}
    </Card>
  );
}

function MiInscripcion({ partido, mia }: { partido: Partido; mia: NonNullable<DetallePartido['miInscripcion']> }) {
  const refrescar = useRefrescarPartido(partido.id);
  const m = useMutation({ mutationFn: () => retirarInscripcion(mia.id), onSuccess: refrescar });
  return (
    <Card className="stack">
      <h2>Mi cupo</h2>
      <p>
        Tu solicitud de cupo está <strong>{ETIQUETA_SOLICITUD[mia.estado]}</strong>.
        {mia.posicion && <span className="muted"> Posición: {POSICIONES.find((x) => x.valor === mia.posicion)?.etiqueta ?? mia.posicion}.</span>}
      </p>
      {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      {(mia.estado === 'pendiente' || mia.estado === 'aceptada') && (
        <div>
          <Button variant="secondary" loading={m.isPending} onClick={() => m.mutate()}>
            {mia.estado === 'pendiente' ? 'Retirar mi solicitud' : 'Liberar mi cupo'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function CancelarPartido({ partido }: { partido: Partido }) {
  const refrescar = useRefrescarPartido(partido.id);
  const [abierto, setAbierto] = useState(false);
  const m = useMutation({
    mutationFn: () => cancelarPartido(partido.id),
    onSuccess: async () => {
      setAbierto(false);
      await refrescar();
    },
  });
  return (
    <>
      <div>
        <Button variant="danger" onClick={() => { m.reset(); setAbierto(true); }}>
          Cancelar partido
        </Button>
      </div>
      <Modal
        abierto={abierto}
        titulo="Cancelar partido"
        onCerrar={() => setAbierto(false)}
        acciones={
          <>
            <Button variant="secondary" onClick={() => setAbierto(false)}>
              Volver
            </Button>
            <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
              Cancelar partido
            </Button>
          </>
        }
      >
        <p>El partido se cancelará y dejará de estar publicado; tu reserva sigue activa.</p>
        {m.isError && <Alert tone="error">{mensajeAccion(m.error)}</Alert>}
      </Modal>
    </>
  );
}

export function MatchDetailPage() {
  const { id } = useParams();
  const partidoId = Number(id);
  const idValido = /^\d+$/.test(id ?? '') && partidoId > 0;
  const { usuario } = useAuth();
  const location = useLocation();
  const consulta = useQuery({ queryKey: ['partido', partidoId], queryFn: () => obtenerPartido(partidoId), enabled: idValido, retry: false });
  const equipos = useQuery({ queryKey: ['mis-equipos'], queryFn: misEquipos, enabled: usuario !== null });

  if (!idValido || (consulta.isError && consulta.error instanceof ApiError && consulta.error.status === 404)) {
    return (
      <div className="page page--narrow stack">
        <h1>Partido no encontrado</h1>
        <Alert tone="error">No encontramos ese partido.</Alert>
        <Link className="btn btn--primary" to="/partidos">
          Ver partidos
        </Link>
      </div>
    );
  }
  if (consulta.isPending) return <Spinner />;
  if (consulta.isError) {
    return (
      <div className="page page--narrow stack">
        <h1>No pudimos cargar el partido</h1>
        <Alert tone="error">{mensajeError(consulta.error)}</Alert>
      </div>
    );
  }

  const { partido: p, ultimosResultados, esCapitanPublicador, miPostulacion, miInscripcion } = consulta.data;
  const r = p.reserva;
  const capitaneados = (equipos.data?.equipos ?? []).filter((e) => e.capitanId === usuario?.id && e.estado === 'activo');
  const abierto = p.estado === 'buscando';

  return (
    <div className="page stack stack--wide">
      <div className="court-card__head">
        <h1>{etiquetaModalidad(p.modalidad)}</h1>
        <Badge tone={p.estado === 'cancelado' ? 'danger' : p.estado === 'buscando' ? 'success' : 'info'}>{ETIQUETA_ESTADO[p.estado]}</Badge>
      </div>

      {p.estado === 'rival_confirmado' && p.equipoRival && <Alert tone="success">¡Rival confirmado! {p.equipoRival.nombre} jugará este partido.</Alert>}
      {p.estado === 'completo' && <Alert tone="success">Este partido ya está completo.</Alert>}

      <Card className="stack">
        {r ? (
          <>
            <h2>
              <Link to={`/complejos/${r.complejo.id}`}>{r.complejo.nombre}</Link>
            </h2>
            <p className="muted">
              {r.cancha} · Fútbol {r.tipoFutbol} · {r.complejo.direccion}, {r.complejo.barrio}, {r.complejo.ciudad}
            </p>
            <p>
              <strong>{formatFecha(r.fecha)}</strong>, {formatHora(r.horaInicio)} - {formatHora(r.horaFin)}
            </p>
            <p>Valor de la cancha: {formatCOP(r.precioTotal)}</p>
          </>
        ) : (
          <>
            <h2>Busca cancha</h2>
            <p>
              <strong>{p.fechaPreferida ? formatFecha(p.fechaPreferida) : 'Fecha por definir'}</strong>
              {p.rangoHoraInicio && p.rangoHoraFin && (
                <>
                  , entre {formatHora(p.rangoHoraInicio)} y {formatHora(p.rangoHoraFin)}
                </>
              )}
            </p>
            {p.zona && <p className="muted">Zona: {p.zona}</p>}
          </>
        )}
        <p>Nivel buscado: {etiquetaNivel(p.nivelBuscado)}</p>
        {p.descripcion && <p>{p.descripcion}</p>}
        {p.modalidad === 'busco_rival' && (
          <>
            {p.valorPorEquipo && (
              <p>
                Valor por equipo: publicador <strong>{formatCOP(p.valorPorEquipo.publicador)}</strong> · rival <strong>{formatCOP(p.valorPorEquipo.rival)}</strong> (el rival paga el{' '}
                {p.porcentajePagoRival}%)
              </p>
            )}
            {p.aceptacionAutomatica && <p className="muted">Acepta automáticamente al primer rival que se postule.</p>}
          </>
        )}
        {p.modalidad === 'faltan_jugadores' && (
          <p>
            Cupos: <strong>{p.cuposDisponibles ?? 0}</strong> · Aporte por jugador: <strong>{formatCOP(p.aportePorJugador ?? 0)}</strong>
            {p.posicionDeseada && <> · Posición que buscan: <strong>{POSICIONES.find((x) => x.valor === p.posicionDeseada)?.etiqueta ?? p.posicionDeseada}</strong></>}
          </p>
        )}
      </Card>

      <Card className="stack">
        <h2>Equipo publicador</h2>
        <EquipoLinea equipo={p.equipoPublicador} />
        {ultimosResultados.length > 0 ? (
          <>
            <h3>Últimos resultados</h3>
            <ul className="item-list">
              {ultimosResultados.map((u) => (
                <li key={u.partidoId}>
                  {formatFecha(u.fecha)}: <strong>{u.golesPropios} - {u.golesRival}</strong>{' '}
                  <span className="muted">{u.golesPropios > u.golesRival ? '(ganó)' : u.golesPropios < u.golesRival ? '(perdió)' : '(empató)'}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">Sin resultados registrados todavía.</p>
        )}
        {p.equipoRival && (
          <>
            <h3>Equipo rival</h3>
            <EquipoLinea equipo={p.equipoRival} />
          </>
        )}
      </Card>

      {!esCapitanPublicador && miPostulacion && <MiPostulacion partido={p} mia={miPostulacion} />}
      {!esCapitanPublicador && miInscripcion && <MiInscripcion partido={p} mia={miInscripcion} />}

      {abierto && !esCapitanPublicador && (
        <>
          {!usuario && (
            <Alert tone="info">
              <Link to="/ingresar" state={{ from: location }}>
                Ingresa
              </Link>{' '}
              para participar en este partido.
            </Alert>
          )}
          {usuario && equipos.isError && <Alert tone="error">{mensajeError(equipos.error)}</Alert>}
          {usuario && p.modalidad === 'busco_rival' && !miPostulacion && <Postular partido={p} equipos={capitaneados} />}
          {usuario && p.modalidad === 'faltan_jugadores' && (!miInscripcion || miInscripcion.estado === 'rechazada') && <PedirCupo partido={p} />}
          {usuario && p.modalidad === 'busco_partido_sin_cancha' && <AceptarConReserva partido={p} equipos={capitaneados} />}
        </>
      )}

      {esCapitanPublicador && (
        <>
          {p.modalidad === 'busco_rival' && <PanelPostulaciones partido={p} />}
          {p.modalidad === 'faltan_jugadores' && <PanelInscripciones partido={p} />}
          {(p.estado === 'buscando' || p.estado === 'rival_confirmado' || p.estado === 'completo') && <CancelarPartido partido={p} />}
        </>
      )}
    </div>
  );
}
