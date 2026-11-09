import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Button, Card, Spinner } from '../../../components/ui';
import { formatFecha } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { misEquipos, misInvitaciones, responderInvitacion } from '../api';
import { etiquetaNivel } from '../types';

export function MyTeamsPage() {
  const queryClient = useQueryClient();
  const { usuario } = useAuth();
  const equipos = useQuery({ queryKey: ['mis-equipos'], queryFn: misEquipos });
  const invitaciones = useQuery({ queryKey: ['mis-invitaciones'], queryFn: misInvitaciones });

  const responder = useMutation({
    mutationFn: (v: { id: number; aceptar: boolean }) => responderInvitacion(v.id, v.aceptar),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mis-invitaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['mis-equipos'] }),
        queryClient.invalidateQueries({ queryKey: ['equipo'] }),
      ]);
    },
  });

  const pendientes = (invitaciones.data?.invitaciones ?? []).filter((i) => i.estado === 'pendiente');

  return (
    <div className="page stack stack--wide">
      <div className="court-card__head">
        <h1>Mis equipos</h1>
        <Link className="btn btn--primary" to="/equipos/crear">
          Crear equipo
        </Link>
      </div>

      {responder.isError && <Alert tone="error">{mensajeError(responder.error)}</Alert>}

      {pendientes.length > 0 && (
        <section className="stack stack--wide" aria-labelledby="titulo-invitaciones">
          <h2 id="titulo-invitaciones">Invitaciones pendientes</h2>
          <ul className="card-grid">
            {pendientes.map((i) => (
              <li key={i.id}>
                <Card className="card--wide stack">
                  <h3>
                    <Link to={`/equipos/${i.equipo.id}`}>{i.equipo.nombre}</Link>
                  </h3>
                  <p className="muted">
                    Fútbol {i.equipo.tipoFutbol} · {etiquetaNivel(i.equipo.nivel)} · {formatFecha(i.fecha)}
                  </p>
                  <div className="row-actions">
                    <Button
                      loading={responder.isPending && responder.variables?.id === i.id && responder.variables.aceptar}
                      disabled={responder.isPending}
                      onClick={() => responder.mutate({ id: i.id, aceptar: true })}
                    >
                      Aceptar
                    </Button>
                    <Button
                      variant="secondary"
                      loading={responder.isPending && responder.variables?.id === i.id && !responder.variables.aceptar}
                      disabled={responder.isPending}
                      onClick={() => responder.mutate({ id: i.id, aceptar: false })}
                    >
                      Rechazar
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invitaciones.isError && <Alert tone="error">{mensajeError(invitaciones.error)}</Alert>}

      <section className="stack stack--wide" aria-labelledby="titulo-equipos">
        <h2 id="titulo-equipos">Mis equipos</h2>
        {equipos.isPending && <Spinner />}
        {equipos.isError && <Alert tone="error">{mensajeError(equipos.error)}</Alert>}
        {equipos.isSuccess && equipos.data.equipos.length === 0 && (
          <Card>
            <p>Todavía no perteneces a ningún equipo. Crea el tuyo o pide un enlace de invitación.</p>
            <Link className="btn btn--primary" to="/equipos/crear">
              Crear equipo
            </Link>
          </Card>
        )}
        {equipos.isSuccess && equipos.data.equipos.length > 0 && (
          <ul className="card-grid">
            {equipos.data.equipos.map((e) => (
              <li key={e.id}>
                <Card className="card--wide stack">
                  <div className="court-card__head">
                    <h3>
                      <Link to={`/equipos/${e.id}`}>{e.nombre}</Link>
                    </h3>
                    {e.estado === 'inactivo' && <Badge tone="neutral">Inactivo</Badge>}
                  </div>
                  <p className="muted">
                    Fútbol {e.tipoFutbol} · {etiquetaNivel(e.nivel)} · {e.totalMiembros} {e.totalMiembros === 1 ? 'miembro' : 'miembros'}
                  </p>
                  {usuario && e.capitanPropuestoId === usuario.id && (
                    <p>
                      <Badge tone="warning">Te propusieron como capitán</Badge>{' '}
                      <Link to={`/equipos/${e.id}`}>Ver propuesta</Link>
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
