import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { contarNoLeidas } from '../api';

/** HU-28.4: campana con el contador de no leídas (se refresca cada 60 s). */
export function NotificationBell() {
  const consulta = useQuery({
    queryKey: ['notificaciones', 'no-leidas'],
    queryFn: contarNoLeidas,
    refetchInterval: 60_000,
  });
  const n = consulta.data?.noLeidas ?? 0;
  const etiqueta = n === 0 ? 'Notificaciones' : `Notificaciones, ${n} sin leer`;
  return (
    <Link to="/notificaciones" className="bell" aria-label={etiqueta}>
      <svg className="bell__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"
        />
      </svg>
      {n > 0 && (
        <span className="bell__count" aria-hidden="true">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  );
}
