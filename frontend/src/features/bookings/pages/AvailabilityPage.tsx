import { StarRatingDisplay } from '../../ratings/components/StarRating';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Card, Spinner } from '../../../components/ui';
import { formatCOP, formatFecha, formatHora, hoyBogota } from '../../../lib/format';
import { mensajeError } from '../../venues/utils';
import { buscarDisponibilidad } from '../api';
import { AvailabilityFilters } from '../components/AvailabilityFilters';
import type { FiltrosDisponibilidad } from '../types';

export function rutaReservar(canchaId: number, fecha: string, hora: string): string {
  const p = new URLSearchParams({ canchaId: String(canchaId), fecha, hora: formatHora(hora) });
  return `/reservar?${p.toString()}`;
}

export function AvailabilityPage() {
  const [params, setParams] = useSearchParams();
  const hoy = hoyBogota();
  const fechaParam = params.get('fecha') ?? '';
  const filtros: FiltrosDisponibilidad = {
    fecha: fechaParam >= hoy ? fechaParam : hoy,
    ciudad: params.get('ciudad') ?? '',
    barrio: params.get('barrio') ?? '',
    tipoFutbol: params.get('tipoFutbol') ?? '',
    horaDesde: params.get('horaDesde') ?? '',
    horaHasta: params.get('horaHasta') ?? '',
    lat: params.get('lat') ?? '',
    lng: params.get('lng') ?? '',
  };

  const consulta = useQuery({
    queryKey: ['disponibilidad', filtros],
    queryFn: () => buscarDisponibilidad(filtros),
  });

  function buscar(f: FiltrosDisponibilidad) {
    const nuevo = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) nuevo.set(k, v);
    setParams(nuevo);
  }

  return (
    <div className="page stack stack--wide">
      <h1>Buscar cancha</h1>
      <Card>
        <AvailabilityFilters key={JSON.stringify(filtros)} valores={filtros} onBuscar={buscar} />
      </Card>

      <section aria-live="polite" className="stack stack--wide">
        {consulta.isPending && <Spinner label="Buscando canchas…" />}
        {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
        {consulta.isSuccess && consulta.data.limitado && (
          <Alert tone="info">Hay muchos resultados: filtra por ciudad o tipo de cancha para ver todos.</Alert>
        )}
        {consulta.isSuccess && consulta.data.resultados.length > 0 && (
          <>
            <h2>Canchas libres el {formatFecha(consulta.data.fecha)}</h2>
            <ul className="card-grid">
              {consulta.data.resultados.map((r) => (
                <li key={r.complejo.id}>
                  <Card className="card--wide">
                    <h3>
                      <Link to={`/complejos/${r.complejo.id}`}>{r.complejo.nombre}</Link>
                    </h3>
                    <p className="muted">
                      {r.complejo.direccion}, {r.complejo.barrio}, {r.complejo.ciudad}
                      {r.complejo.distanciaKm !== null && <> · A {r.complejo.distanciaKm.toFixed(1)} km</>}
                    </p>
                    <StarRatingDisplay resumen={r.complejo.calificacion} compacto />
                    {r.precioDesde !== null && <p className="venue-card__price">Desde {formatCOP(r.precioDesde)}</p>}
                    {r.canchas.map((c) => (
                      <div key={c.id} className="stack stack--wide">
                        <h4>
                          {c.nombre} <span className="muted">· Fútbol {c.tipoFutbol}</span>
                        </h4>
                        <ul className="slot-grid slot-grid--compact" aria-label={`Franjas libres de ${c.nombre}`}>
                          {c.franjas.map((f) => (
                            <li key={f.horaInicio}>
                              <Link
                                className="slot slot--libre slot--link"
                                to={rutaReservar(c.id, consulta.data.fecha, f.horaInicio)}
                                aria-label={`Reservar ${c.nombre} a las ${formatHora(f.horaInicio)}${f.precio !== null ? `, ${formatCOP(f.precio)}` : ''}`}
                              >
                                <span className="slot__time">{formatHora(f.horaInicio)}</span>
                                <span className="slot__price">{f.precio !== null ? formatCOP(f.precio) : '—'}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
        {consulta.isSuccess && consulta.data.resultados.length === 0 && (
          <>
            {consulta.data.sugerencias.length > 0 ? (
              <>
                <Alert tone="info">No hay canchas libres en ese horario. Estas franjas están cerca:</Alert>
                <ul className="card-grid">
                  {consulta.data.sugerencias.map((s) => (
                    <li key={`${s.cancha.id}-${s.franja.horaInicio}`}>
                      <Card className="card--wide">
                        <h3>{s.complejo.nombre}</h3>
                        <p className="muted">
                          {s.cancha.nombre} · Fútbol {s.cancha.tipoFutbol} · {s.complejo.barrio}, {s.complejo.ciudad}
                        </p>
                        <Link className="btn btn--secondary" to={rutaReservar(s.cancha.id, consulta.data.fecha, s.franja.horaInicio)}>
                          {formatHora(s.franja.horaInicio)} - {formatHora(s.franja.horaFin)}
                          {s.franja.precio !== null ? ` · ${formatCOP(s.franja.precio)}` : ''}
                        </Link>
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Card>
                <h2>Sin resultados</h2>
                <p>No encontramos canchas libres con esos filtros. Prueba con otra fecha, barrio u horario.</p>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}
