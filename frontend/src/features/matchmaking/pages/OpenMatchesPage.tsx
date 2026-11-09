import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Card, Spinner } from '../../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { mensajeError } from '../../venues/utils';
import { explorarPartidos } from '../api';
import { MatchFilters } from '../components/MatchFilters';
import { OpenMatchCard } from '../components/OpenMatchCard';
import type { FiltrosPartidos } from '../types';

export function OpenMatchesPage() {
  const { usuario } = useAuth();
  const [params, setParams] = useSearchParams();
  const filtros: FiltrosPartidos = {
    fecha: params.get('fecha') ?? '',
    horaDesde: params.get('horaDesde') ?? '',
    horaHasta: params.get('horaHasta') ?? '',
    ciudad: params.get('ciudad') ?? '',
    barrio: params.get('barrio') ?? '',
    tipoFutbol: params.get('tipoFutbol') ?? '',
    nivel: params.get('nivel') ?? '',
    modalidad: params.get('modalidad') ?? '',
  };
  const consulta = useQuery({ queryKey: ['partidos', filtros], queryFn: () => explorarPartidos(filtros) });

  function buscar(f: FiltrosPartidos) {
    const nuevo = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) nuevo.set(k, v);
    setParams(nuevo);
  }

  return (
    <div className="page stack stack--wide">
      <div className="court-card__head">
        <h1>Busca Partido</h1>
        {usuario && (
          <Link className="btn btn--primary" to="/partidos/publicar">
            Publicar partido
          </Link>
        )}
      </div>
      <Card>
        <MatchFilters key={JSON.stringify(filtros)} valores={filtros} onBuscar={buscar} />
      </Card>

      <section aria-live="polite" className="stack stack--wide">
        {consulta.isPending && <Spinner label="Buscando partidos…" />}
        {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
        {consulta.isSuccess && consulta.data.partidos.length === 0 && (
          <Card>
            <h2>Sin partidos abiertos</h2>
            <p>No encontramos partidos con esos filtros. Prueba con otros o publica el tuyo.</p>
            {!usuario && (
              <Link className="btn btn--secondary" to="/ingresar" state={{ from: { pathname: '/partidos/publicar' } }}>
                Ingresar para publicar
              </Link>
            )}
          </Card>
        )}
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
    </div>
  );
}
