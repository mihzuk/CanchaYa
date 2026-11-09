import { Link } from 'react-router-dom';
import { Badge, Card } from '../../../components/ui';
import { formatCOP } from '../../../lib/format';
import type { ComplejoResumen } from '../types';

interface VenueCardProps {
  complejo: ComplejoResumen;
  /** Enlace de destino; por defecto el detalle público. */
  to?: string;
}

export function VenueCard({ complejo, to }: VenueCardProps) {
  return (
    <Card className="venue-card">
      {complejo.fotoPrincipal ? (
        <img
          className="venue-card__photo"
          src={complejo.fotoPrincipal}
          alt={`Foto de ${complejo.nombre}`}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="venue-card__photo venue-card__photo--empty" aria-hidden="true">
          Sin foto
        </div>
      )}
      <div className="venue-card__body">
        <h3>
          <Link to={to ?? `/complejos/${complejo.id}`}>{complejo.nombre}</Link>
        </h3>
        <p className="muted">
          {complejo.barrio}, {complejo.ciudad}
          <br />
          {complejo.direccion}
        </p>
        {complejo.tiposFutbol.length > 0 && (
          <p className="venue-card__meta">
            Fútbol {complejo.tiposFutbol.join(', ')} · {complejo.canchasActivas}{' '}
            {complejo.canchasActivas === 1 ? 'cancha' : 'canchas'}
          </p>
        )}
        {complejo.servicios.length > 0 && (
          <ul className="chips" aria-label="Servicios">
            {complejo.servicios.map((s) => (
              <li key={s}>
                <Badge tone="info">{s}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="venue-card__price">
          {complejo.precioDesde !== null ? `Desde ${formatCOP(complejo.precioDesde)}` : 'Tarifas por definir'}
        </p>
      </div>
    </Card>
  );
}
