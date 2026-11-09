import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Input, Select } from '../../../components/ui';
import { NIVELES_EQUIPO } from '../../teams/types';
import { TIPOS_FUTBOL } from '../../venues/types';
import { opcionesHora } from '../../venues/utils';
import { MODALIDADES } from '../types';
import type { FiltrosPartidos } from '../types';

interface Props {
  valores: FiltrosPartidos;
  onBuscar: (f: FiltrosPartidos) => void;
}

const HORAS_DESDE = opcionesHora(false);
const HORAS_HASTA = opcionesHora(true);

export function MatchFilters({ valores, onBuscar }: Props) {
  const [f, setF] = useState<FiltrosPartidos>(valores);
  const cambiar = (campo: keyof FiltrosPartidos) => (e: { target: { value: string } }) => setF((prev) => ({ ...prev, [campo]: e.target.value }));
  const horaInvalida = f.horaDesde !== '' && f.horaHasta !== '' && f.horaDesde >= f.horaHasta;

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!horaInvalida) onBuscar(f);
  }

  return (
    <form onSubmit={enviar} className="form" aria-label="Filtros de partidos" noValidate>
      <div className="filters__grid">
        <Select label="Modalidad" value={f.modalidad} onChange={cambiar('modalidad')} placeholder="Todas" options={MODALIDADES.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))} />
        <Input label="Fecha" type="date" value={f.fecha} onChange={cambiar('fecha')} />
        <Select label="Desde" value={f.horaDesde} onChange={cambiar('horaDesde')} placeholder="Cualquier hora" options={HORAS_DESDE} />
        <Select
          label="Hasta"
          value={f.horaHasta}
          onChange={cambiar('horaHasta')}
          placeholder="Cualquier hora"
          options={HORAS_HASTA}
          error={horaInvalida ? 'La hora final debe ser posterior a la inicial.' : undefined}
        />
        <Input label="Ciudad" value={f.ciudad} onChange={cambiar('ciudad')} maxLength={80} />
        <Input label="Barrio" value={f.barrio} onChange={cambiar('barrio')} maxLength={80} />
        <Select
          label="Tipo de fútbol"
          value={f.tipoFutbol}
          onChange={cambiar('tipoFutbol')}
          placeholder="Todos"
          options={TIPOS_FUTBOL.map((t) => ({ valor: String(t), etiqueta: `Fútbol ${t}` }))}
        />
        <Select label="Nivel" value={f.nivel} onChange={cambiar('nivel')} placeholder="Todos" options={NIVELES_EQUIPO.map((n) => ({ valor: n.valor, etiqueta: n.etiqueta }))} />
      </div>
      <div className="row-actions">
        <Button type="submit" disabled={horaInvalida}>
          Buscar partidos
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const vacio: FiltrosPartidos = { fecha: '', horaDesde: '', horaHasta: '', ciudad: '', barrio: '', tipoFutbol: '', nivel: '', modalidad: '' };
            setF(vacio);
            onBuscar(vacio);
          }}
        >
          Limpiar filtros
        </Button>
      </div>
    </form>
  );
}
