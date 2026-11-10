import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Card, Input, Spinner } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { formatHora, hoyBogota } from '../../../lib/format';
import { disponibilidadComplejo } from '../../bookings/api';
import { rutaReservar } from '../../bookings/pages/AvailabilityPage';
import { StarRatingDisplay } from '../../ratings/components/StarRating';
import { VenueReviews } from '../../ratings/components/VenueReviews';
import { obtenerComplejo } from '../api';
import { CourtCard } from '../components/CourtCard';
import { SlotGrid, SlotLegend } from '../components/SlotGrid';
import type { Foto, Horario } from '../types';
import { DIAS_SEMANA, mensajeError } from '../utils';

function Galeria({ fotos, nombre }: { fotos: Foto[]; nombre: string }) {
  const ordenadas = [...fotos].sort((a, b) => a.orden - b.orden);
  const [actual, setActual] = useState(0);
  const foto = ordenadas[Math.min(actual, ordenadas.length - 1)];
  if (!foto) return null;
  return (
    <section className="gallery" aria-label={`Fotos de ${nombre}`}>
      <img className="gallery__main" src={foto.url} alt={`${nombre}, foto ${actual + 1} de ${ordenadas.length}`} referrerPolicy="no-referrer" />
      {ordenadas.length > 1 && (
        <ul className="gallery__thumbs">
          {ordenadas.map((f, i) => (
            <li key={f.id}>
              <button type="button" onClick={() => setActual(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === actual}>
                <img src={f.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HorarioSemanal({ horarios }: { horarios: Horario[] }) {
  const semanales = horarios.filter((h) => h.diaSemana !== null);
  return (
    <section>
      <h2>Horario</h2>
      <dl className="hours">
        {DIAS_SEMANA.map((dia, i) => {
          const h = semanales.find((x) => x.diaSemana === i + 1);
          return (
            <div key={dia}>
              <dt>{dia}</dt>
              <dd>{h && !h.cerrado && h.horaApertura && h.horaCierre ? `${formatHora(h.horaApertura)} - ${formatHora(h.horaCierre)}` : 'Cerrado'}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function Disponibilidad({ complejoId, fecha }: { complejoId: number; fecha: string }) {
  const navigate = useNavigate();
  const consulta = useQuery({
    queryKey: ['disponibilidad-complejo', complejoId, fecha],
    queryFn: () => disponibilidadComplejo(complejoId, fecha),
  });
  if (consulta.isPending) return <Spinner label="Cargando turnos…" />;
  if (consulta.isError) return <Alert tone="error">{mensajeError(consulta.error)}</Alert>;
  return (
    <>
      {consulta.data.canchas.map((c) => (
        <Card key={c.id}>
          <h3>
            {c.nombre} <span className="muted">· Fútbol {c.tipoFutbol}</span>
          </h3>
          <SlotGrid
            etiqueta={c.nombre}
            franjas={c.franjas}
            onSeleccionar={(f) => void navigate(rutaReservar(c.id, fecha, f.horaInicio))}
          />
        </Card>
      ))}
    </>
  );
}

export function VenueDetailPage() {
  const { id } = useParams();
  const complejoId = Number(id);
  const [fecha, setFecha] = useState(hoyBogota());
  const hoy = hoyBogota();

  const consulta = useQuery({
    queryKey: ['complejo', complejoId],
    queryFn: () => obtenerComplejo(complejoId),
    enabled: Number.isInteger(complejoId) && complejoId > 0,
  });

  if (consulta.isPending && !consulta.isError) return <Spinner />;
  if (consulta.isError) {
    const noExiste = consulta.error instanceof ApiError && consulta.error.status === 404;
    return (
      <div className="page stack">
        <h1>{noExiste ? 'Complejo no encontrado' : 'No pudimos cargar el complejo'}</h1>
        <p>{noExiste ? 'Es posible que ya no esté disponible.' : mensajeError(consulta.error)}</p>
        <Link className="btn btn--primary" to="/complejos">
          Ver todos los complejos
        </Link>
      </div>
    );
  }

  const { complejo, canchas, horarios, esGestor, calificacion } = consulta.data;
  const activas = canchas.filter((c) => c.estado === 'activa');

  return (
    <div className="page stack stack--wide">
      {complejo.estado !== 'activo' && (
        <Alert tone="warning">Este complejo aún no es público ({complejo.estado === 'pendiente' ? 'pendiente de aprobación' : 'rechazado'}). Solo tú puedes verlo.</Alert>
      )}
      <header>
        <h1>{complejo.nombre}</h1>
        <p className="muted">
          {complejo.direccion}, {complejo.barrio}, {complejo.ciudad}
          <br />
          Teléfono: <a href={`tel:${complejo.telefono}`}>{complejo.telefono}</a>
        </p>
        <p>
          <StarRatingDisplay resumen={calificacion ?? null} />
        </p>
        {esGestor && (
          <Link className="btn btn--secondary" to={`/mis-complejos/${complejo.id}`}>
            Administrar complejo
          </Link>
        )}
      </header>

      <Galeria fotos={complejo.fotos} nombre={complejo.nombre} />

      {complejo.descripcion && (
        <section>
          <h2>Acerca del complejo</h2>
          <p>{complejo.descripcion}</p>
        </section>
      )}

      {complejo.servicios.length > 0 && (
        <section>
          <h2>Servicios</h2>
          <ul className="chips">
            {complejo.servicios.map((s) => (
              <li key={s.id}>
                <Badge tone="info">{s.nombre}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <HorarioSemanal horarios={horarios} />

      <section className="stack stack--wide">
        <h2>Canchas</h2>
        {canchas.length === 0 ? (
          <p>Este complejo aún no tiene canchas registradas.</p>
        ) : (
          <ul className="card-grid">
            {canchas.map((c) => (
              <li key={c.id}>
                <CourtCard cancha={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {activas.length > 0 && (
        <section className="stack stack--wide">
          <h2>Disponibilidad</h2>
          <Input label="Fecha" type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value && e.target.value >= hoy ? e.target.value : hoy)} />
          <SlotLegend />
          <Disponibilidad complejoId={complejo.id} fecha={fecha} />
        </section>
      )}

      <VenueReviews complejoId={complejo.id} />
    </div>
  );
}
