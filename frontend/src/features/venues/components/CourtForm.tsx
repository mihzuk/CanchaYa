import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, Input, Select, useToast } from '../../../components/ui';
import { erroresDeApi, limpiar, validarObligatorio } from '../../auth/validation';
import type { Errores } from '../../auth/validation';
import { actualizarCancha, crearCancha } from '../api';
import { TIPOS_FUTBOL } from '../types';
import type { Cancha, CanchaInput, TipoFutbol } from '../types';

interface CourtFormProps {
  complejoId: number;
  /** Cancha a editar; si no se entrega, se crea una nueva. */
  cancha?: Cancha;
  onTerminar: () => void;
}

export function CourtForm({ complejoId, cancha, onTerminar }: CourtFormProps) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [nombre, setNombre] = useState(cancha?.nombre ?? '');
  const [tipo, setTipo] = useState<string>(String(cancha?.tipoFutbol ?? 5));
  const [superficie, setSuperficie] = useState(cancha?.superficie ?? 'Césped sintético');
  const [techada, setTechada] = useState(cancha?.techada ?? false);
  const [iluminacion, setIluminacion] = useState(cancha?.iluminacion ?? false);
  const [capacidad, setCapacidad] = useState(cancha ? String(cancha.capacidadJugadores) : '');
  const [activa, setActiva] = useState((cancha?.estado ?? 'activa') === 'activa');
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: (d: CanchaInput) => (cancha ? actualizarCancha(cancha.id, d) : crearCancha(complejoId, d)),
    onSuccess: () => {
      mostrar(cancha ? 'Cancha actualizada.' : 'Cancha creada.', 'success');
      void qc.invalidateQueries({ queryKey: ['complejo', complejoId] });
      onTerminar();
    },
    onError: (e) => {
      const r = erroresDeApi(e);
      setErrores(r.campos);
      setGeneral(r.general);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const cap = capacidad.trim() === '' ? undefined : Number(capacidad);
    const nuevos = limpiar({
      nombre: validarObligatorio(nombre, 'El nombre de la cancha'),
      superficie: validarObligatorio(superficie, 'La superficie'),
      capacidadJugadores:
        cap === undefined || (Number.isInteger(cap) && cap >= 2 && cap <= 40) ? undefined : 'La capacidad debe estar entre 2 y 40 jugadores.',
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    mutacion.mutate({
      nombre: nombre.trim(),
      tipoFutbol: Number(tipo) as TipoFutbol,
      superficie: superficie.trim(),
      techada,
      iluminacion,
      ...(cap !== undefined ? { capacidadJugadores: cap } : {}),
      estado: activa ? 'activa' : 'inactiva',
    });
  }

  return (
    <Card>
      <h3>{cancha ? `Editar ${cancha.nombre}` : 'Nueva cancha'}</h3>
      <form onSubmit={enviar} noValidate className="form">
        {general && <Alert tone="error">{general}</Alert>}
        <Input label="Nombre" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
        <div className="form__row">
          <Select label="Tipo de fútbol" value={tipo} onChange={(e) => setTipo(e.target.value)} options={TIPOS_FUTBOL.map((t) => ({ valor: String(t), etiqueta: `Fútbol ${t}` }))} error={errores.tipoFutbol} />
          <Input label="Superficie" maxLength={40} value={superficie} onChange={(e) => setSuperficie(e.target.value)} error={errores.superficie} />
        </div>
        <Input label="Capacidad de jugadores (opcional)" type="number" inputMode="numeric" min={2} max={40} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} error={errores.capacidadJugadores} hint="Si la dejas vacía, se calcula según el tipo de fútbol." />
        <div className="check">
          <label className="check__label">
            <input type="checkbox" checked={techada} onChange={(e) => setTechada(e.target.checked)} />
            <span>Techada</span>
          </label>
        </div>
        <div className="check">
          <label className="check__label">
            <input type="checkbox" checked={iluminacion} onChange={(e) => setIluminacion(e.target.checked)} />
            <span>Con iluminación</span>
          </label>
        </div>
        <div className="check">
          <label className="check__label">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
            <span>Cancha activa</span>
          </label>
          <p className="field__hint">Una cancha inactiva no aparece en búsquedas pero conserva su historial.</p>
        </div>
        <div className="row-actions">
          <Button type="submit" loading={mutacion.isPending}>
            {cancha ? 'Guardar cambios' : 'Crear cancha'}
          </Button>
          <Button variant="ghost" onClick={onTerminar}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
