import type { ReactNode } from 'react';
import { Badge, Card } from '../../../components/ui';
import type { Cancha } from '../types';

interface CourtCardProps {
  cancha: Cancha;
  acciones?: ReactNode;
}

export function CourtCard({ cancha, acciones }: CourtCardProps) {
  return (
    <Card className="court-card">
      <div className="court-card__head">
        <h3>{cancha.nombre}</h3>
        {cancha.estado === 'inactiva' && <Badge tone="warning">Inactiva</Badge>}
      </div>
      <ul className="chips" aria-label={`Características de ${cancha.nombre}`}>
        <li>
          <Badge tone="success">Fútbol {cancha.tipoFutbol}</Badge>
        </li>
        <li>
          <Badge>{cancha.superficie}</Badge>
        </li>
        {cancha.techada && (
          <li>
            <Badge>Techada</Badge>
          </li>
        )}
        {cancha.iluminacion && (
          <li>
            <Badge>Con iluminación</Badge>
          </li>
        )}
      </ul>
      <p className="muted">Capacidad: {cancha.capacidadJugadores} jugadores</p>
      {acciones && <div className="row-actions">{acciones}</div>}
    </Card>
  );
}
