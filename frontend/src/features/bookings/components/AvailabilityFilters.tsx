import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Input, Select } from '../../../components/ui';
import { hoyBogota } from '../../../lib/format';
import { TIPOS_FUTBOL } from '../../venues/types';
import { opcionesHora } from '../../venues/utils';
import type { FiltrosDisponibilidad } from '../types';

interface Props {
  valores: FiltrosDisponibilidad;
  onBuscar: (f: FiltrosDisponibilidad) => void;
}

const HORAS_DESDE = opcionesHora(false);
const HORAS_HASTA = opcionesHora(true);

export function AvailabilityFilters({ valores, onBuscar }: Props) {
  const [f, setF] = useState<FiltrosDisponibilidad>(valores);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const hoy = hoyBogota();

  const cambiar = (campo: keyof FiltrosDisponibilidad) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [campo]: e.target.value }));

  function usarUbicacion() {
    setErrorUbicacion(null);
    if (!('geolocation' in navigator)) {
      setErrorUbicacion('Tu navegador no permite obtener la ubicación.');
      return;
    }
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicando(false);
        setF((prev) => ({ ...prev, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
      },
      () => {
        setUbicando(false);
        setErrorUbicacion('No pudimos obtener tu ubicación. Revisa los permisos del navegador.');
      },
      { timeout: 10000 },
    );
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    onBuscar({ ...f, fecha: f.fecha && f.fecha >= hoy ? f.fecha : hoy });
  }

  const hayHoraInvalida = f.horaDesde !== '' && f.horaHasta !== '' && f.horaDesde >= f.horaHasta;

  return (
    <form onSubmit={enviar} className="form" aria-label="Filtros de disponibilidad" noValidate>
      <div className="filters__grid">
        <Input label="Fecha" type="date" min={hoy} value={f.fecha} onChange={cambiar('fecha')} required />
        <Input label="Ciudad" value={f.ciudad} onChange={cambiar('ciudad')} maxLength={80} />
        <Input label="Barrio" value={f.barrio} onChange={cambiar('barrio')} maxLength={80} />
        <Select
          label="Tipo de fútbol"
          value={f.tipoFutbol}
          onChange={cambiar('tipoFutbol')}
          placeholder="Todos"
          options={TIPOS_FUTBOL.map((t) => ({ valor: String(t), etiqueta: `Fútbol ${t}` }))}
        />
        <Select label="Desde" value={f.horaDesde} onChange={cambiar('horaDesde')} placeholder="Cualquier hora" options={HORAS_DESDE} />
        <Select
          label="Hasta"
          value={f.horaHasta}
          onChange={cambiar('horaHasta')}
          placeholder="Cualquier hora"
          options={HORAS_HASTA}
          error={hayHoraInvalida ? 'La hora final debe ser posterior a la inicial.' : undefined}
        />
      </div>
      <div className="row-actions">
        <Button variant="secondary" onClick={usarUbicacion} loading={ubicando}>
          Usar mi ubicación
        </Button>
        {f.lat && f.lng && (
          <>
            <span role="status">Ubicación activa: ordenamos por cercanía.</span>
            <Button variant="ghost" onClick={() => setF((p) => ({ ...p, lat: '', lng: '' }))}>
              Quitar ubicación
            </Button>
          </>
        )}
      </div>
      {errorUbicacion && <Alert tone="warning">{errorUbicacion}</Alert>}
      <Button type="submit" disabled={hayHoraInvalida}>
        Buscar canchas
      </Button>
    </form>
  );
}
