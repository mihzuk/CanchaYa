import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Spinner } from '../../../components/ui';
import { formatFecha } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { calificacionesDeComplejo } from '../api';
import { StarRatingDisplay } from './StarRating';

const TAMANO = 10;

/** Lista pública de reseñas de un complejo (HU-30). */
export function VenueReviews({ complejoId }: { complejoId: number }) {
  const [paginas, setPaginas] = useState(1);
  const consulta = useQuery({
    queryKey: ['calificaciones-complejo', complejoId, paginas],
    queryFn: () => calificacionesDeComplejo(complejoId, 1, TAMANO * paginas),
  });

  const lista = consulta.data?.calificaciones ?? [];
  return (
    <section className="stack stack--wide" aria-label="Reseñas del complejo">
      <h2>Reseñas</h2>
      {consulta.isPending && <Spinner label="Cargando reseñas…" />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {consulta.isSuccess && <p><StarRatingDisplay resumen={consulta.data.resumen} /></p>}
      {consulta.isSuccess && lista.length === 0 && <p className="muted">Este complejo todavía no tiene reseñas.</p>}
      {lista.length > 0 && (
        <ul className="reviews">
          {lista.map((c) => (
            <li key={c.id} className="review">
              <StarRatingDisplay estrellas={c.estrellas} />
              <span className="muted"> · {formatFecha(c.fecha)}</span>
              {c.comentario && <p>{c.comentario}</p>}
            </li>
          ))}
        </ul>
      )}
      {lista.length >= TAMANO * paginas && (
        <div>
          <Button variant="ghost" onClick={() => setPaginas((p) => p + 1)} loading={consulta.isFetching}>
            Ver más reseñas
          </Button>
        </div>
      )}
    </section>
  );
}
