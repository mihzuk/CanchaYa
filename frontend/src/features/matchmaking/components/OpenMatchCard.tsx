import { Link } from 'react-router-dom';
import { Badge, Card } from '../../../components/ui';
import { formatCOP, formatFecha, formatHora } from '../../../lib/format';
import { etiquetaNivel } from '../../teams/types';
import { ETIQUETA_ESTADO, POSICIONES, etiquetaModalidad } from '../types';
import type { Partido } from '../types';

export function textoFairPlay(fairPlay: number | null): string {
  return fairPlay === null ? 'Sin calificaciones' : `Fair play ${fairPlay.toFixed(1)}`;
}

export function OpenMatchCard({ partido: p }: { partido: Partido }) {
  const r = p.reserva;
  return (
    <Card className="card--wide stack">
      <div className="court-card__head">
        <h3>
          <Link to={`/partidos/${p.id}`}>{etiquetaModalidad(p.modalidad)}</Link>
        </h3>
        {p.estado !== 'buscando' && <Badge tone={p.estado === 'cancelado' ? 'danger' : 'info'}>{ETIQUETA_ESTADO[p.estado]}</Badge>}
      </div>

      {r ? (
        <>
          <p>
            <strong>{r.complejo.nombre}</strong> · {r.cancha}
            <br />
            <span className="muted">
              {r.complejo.barrio}, {r.complejo.ciudad}
            </span>
          </p>
          <p>
            {formatFecha(r.fecha)}, {formatHora(r.horaInicio)} - {formatHora(r.horaFin)} · Fútbol {r.tipoFutbol}
          </p>
        </>
      ) : (
        <p>
          {p.fechaPreferida ? formatFecha(p.fechaPreferida) : 'Fecha por definir'}
          {p.rangoHoraInicio && p.rangoHoraFin && (
            <>
              , entre {formatHora(p.rangoHoraInicio)} y {formatHora(p.rangoHoraFin)}
            </>
          )}
          {p.zona && (
            <>
              <br />
              <span className="muted">Zona: {p.zona}</span>
            </>
          )}
        </p>
      )}

      <p>
        <Link to={`/equipos/${p.equipoPublicador.id}`}>{p.equipoPublicador.nombre}</Link>
        <span className="muted">
          {' '}
          · {etiquetaNivel(p.equipoPublicador.nivel)} · {textoFairPlay(p.equipoPublicador.fairPlay)}
        </span>
      </p>
      <p className="muted">Nivel buscado: {etiquetaNivel(p.nivelBuscado)}</p>

      {p.modalidad === 'faltan_jugadores' && (
        <p>
          <strong>{p.cuposDisponibles ?? 0}</strong> {p.cuposDisponibles === 1 ? 'cupo' : 'cupos'} · Aporte por jugador:{' '}
          <strong>{formatCOP(p.aportePorJugador ?? 0)}</strong>
          {p.posicionDeseada && <> · Busca: {POSICIONES.find((x) => x.valor === p.posicionDeseada)?.etiqueta ?? p.posicionDeseada}</>}
        </p>
      )}
      {p.modalidad === 'busco_rival' && p.valorPorEquipo && (
        <p>
          Valor por equipo: <strong>{formatCOP(p.valorPorEquipo.rival)}</strong>
        </p>
      )}
      <div>
        <Link className="btn btn--secondary" to={`/partidos/${p.id}`}>
          Ver detalle
        </Link>
      </div>
    </Card>
  );
}
