import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Card, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatFecha } from '../../../lib/format';
import { obtenerPerfilPublico } from '../api';
import { etiquetaNivel, etiquetaPosicion } from '../types';

export function PublicProfilePage() {
  const { username = '' } = useParams();
  const { data, isPending, error } = useQuery({
    queryKey: ['perfil-publico', username],
    queryFn: () => obtenerPerfilPublico(username),
    enabled: username !== '',
  });

  if (isPending) return <Spinner label="Cargando perfil…" />;
  if (error) {
    const noExiste = error instanceof ApiError && error.status === 404;
    return (
      <div className="page page--narrow stack">
        <Alert tone="error">{noExiste ? 'No encontramos a ese jugador.' : 'No pudimos cargar el perfil.'}</Alert>
        <Link to="/">Volver al inicio</Link>
      </div>
    );
  }

  const p = data.perfil;
  const iniciales = `${p.nombres.charAt(0)}${p.apellidos.charAt(0)}`.toUpperCase();

  return (
    <div className="page page--narrow">
      <Card>
        <div className="profile-head">
          {p.fotoUrl ? (
            <img className="avatar" src={p.fotoUrl} alt={`Foto de ${p.nombres}`} referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar avatar--initials" aria-hidden="true">
              {iniciales}
            </span>
          )}
          <div>
            <h1>
              {p.nombres} {p.apellidos}
            </h1>
            <p className="muted">@{p.username}</p>
          </div>
        </div>
        <dl className="stats">
          <div>
            <dt>Posición</dt>
            <dd>{etiquetaPosicion(p.posicionPreferida)}</dd>
          </div>
          <div>
            <dt>Nivel</dt>
            <dd>{etiquetaNivel(p.nivel)}</dd>
          </div>
          <div>
            <dt>Partidos jugados</dt>
            <dd>{p.partidosJugados}</dd>
          </div>
          <div>
            <dt>Fair play</dt>
            <dd>{p.fairPlay === null ? 'Sin calificaciones' : p.fairPlay.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Miembro desde</dt>
            <dd>{formatFecha(p.fechaRegistro)}</dd>
          </div>
        </dl>
        <h2>Equipos</h2>
        {p.equipos.length === 0 ? (
          <p className="muted">Todavía no pertenece a ningún equipo.</p>
        ) : (
          <ul className="chips">
            {p.equipos.map((e) => (
              <li key={e.id}>
                <Badge tone="info">{e.nombre}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
