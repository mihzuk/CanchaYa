import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { mensajeError } from '../../venues/utils';
import { unirseConEnlace, vistaEnlace } from '../api';
import { etiquetaNivel } from '../types';

function mensajeEnlace(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.codigo === 'TOKEN_EXPIRADO') return 'Este enlace de invitación expiró. Pide uno nuevo al capitán del equipo.';
    if (err.codigo === 'TOKEN_INVALIDO') return 'Este enlace de invitación no es válido. Revisa que lo hayas copiado completo.';
  }
  return mensajeError(err);
}

export function JoinTeamPage() {
  const { token = '' } = useParams();
  const { usuario } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const vista = useQuery({ queryKey: ['enlace-equipo', token], queryFn: () => vistaEnlace(token), retry: false });
  const unirse = useMutation({
    mutationFn: () => unirseConEnlace(token),
    onSuccess: async (r) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mis-equipos'] }),
        queryClient.invalidateQueries({ queryKey: ['equipo'] }),
      ]);
      void navigate(`/equipos/${r.equipo.id}`);
    },
  });

  if (vista.isPending) return <Spinner />;
  if (vista.isError) {
    return (
      <div className="page page--narrow stack">
        <h1>Invitación a un equipo</h1>
        <Alert tone="error">{mensajeEnlace(vista.error)}</Alert>
        <Link className="btn btn--primary" to="/partidos">
          Ir a Busca Partido
        </Link>
      </div>
    );
  }

  const { equipo } = vista.data;
  const yaEsMiembro = unirse.error instanceof ApiError && unirse.error.codigo === 'YA_ES_MIEMBRO';

  return (
    <div className="page page--narrow stack stack--wide">
      <h1>Invitación a un equipo</h1>
      <Card className="stack">
        <div className="profile-head">
          {equipo.escudoUrl && <img className="avatar" src={equipo.escudoUrl} alt="" width={64} height={64} />}
          <div>
            <h2>{equipo.nombre}</h2>
            <p className="muted">
              Fútbol {equipo.tipoFutbol} · {etiquetaNivel(equipo.nivel)} · {equipo.totalMiembros} {equipo.totalMiembros === 1 ? 'miembro' : 'miembros'}
            </p>
          </div>
        </div>
        {unirse.isError && !yaEsMiembro && <Alert tone="error">{mensajeEnlace(unirse.error)}</Alert>}
        {yaEsMiembro && (
          <Alert tone="info">
            Ya eres parte de este equipo. <Link to={`/equipos/${equipo.id}`}>Ver el equipo</Link>
          </Alert>
        )}
        {usuario ? (
          <Button onClick={() => unirse.mutate()} loading={unirse.isPending} disabled={yaEsMiembro}>
            Unirme
          </Button>
        ) : (
          <>
            <Alert tone="info">Inicia sesión para unirte a este equipo.</Alert>
            <Link className="btn btn--primary" to="/ingresar" state={{ from: location }}>
              Ingresar para unirme
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
