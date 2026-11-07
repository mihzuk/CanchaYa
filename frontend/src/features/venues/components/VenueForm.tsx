import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Input } from '../../../components/ui';
import { erroresDeApi, limpiar, validarCelular, validarObligatorio } from '../../auth/validation';
import type { Errores } from '../../auth/validation';
import { listarServicios } from '../api';
import type { Complejo, ComplejoInput } from '../types';

interface VenueFormProps {
  inicial?: Complejo;
  etiquetaEnvio: string;
  onEnviar: (datos: ComplejoInput) => Promise<Complejo>;
  onGuardado: (complejo: Complejo) => void;
}

export function VenueForm({ inicial, etiquetaEnvio, onEnviar, onGuardado }: VenueFormProps) {
  const descId = useId();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [direccion, setDireccion] = useState(inicial?.direccion ?? '');
  const [ciudad, setCiudad] = useState(inicial?.ciudad ?? '');
  const [barrio, setBarrio] = useState(inicial?.barrio ?? '');
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '');
  const [abono, setAbono] = useState(String(inicial?.porcentajeAbono ?? 50));
  const [servicioIds, setServicioIds] = useState<number[]>(inicial?.servicios.map((s) => s.id) ?? []);
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);

  const servicios = useQuery({ queryKey: ['servicios'], queryFn: listarServicios, staleTime: 5 * 60_000 });

  const mutacion = useMutation({
    mutationFn: onEnviar,
    onSuccess: onGuardado,
    onError: (e) => {
      const r = erroresDeApi(e);
      setErrores(r.campos);
      setGeneral(r.general);
    },
  });

  function alternar(id: number, marcado: boolean) {
    setServicioIds((prev) => (marcado ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const p = Number(abono);
    const nuevos = limpiar({
      nombre: validarObligatorio(nombre, 'El nombre'),
      direccion: validarObligatorio(direccion, 'La dirección'),
      ciudad: validarObligatorio(ciudad, 'La ciudad'),
      barrio: validarObligatorio(barrio, 'El barrio'),
      telefono: validarCelular(telefono.trim()),
      porcentajeAbono: Number.isFinite(p) && p >= 10 && p <= 100 ? undefined : 'El abono debe estar entre 10 % y 100 %.',
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    mutacion.mutate({
      nombre: nombre.trim(),
      ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
      direccion: direccion.trim(),
      ciudad: ciudad.trim(),
      barrio: barrio.trim(),
      telefono: telefono.trim(),
      porcentajeAbono: p,
      servicioIds,
      // El formulario no edita la ubicación: se reenvía la existente para no borrarla.
      latitud: inicial?.latitud ?? null,
      longitud: inicial?.longitud ?? null,
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="form">
      {general && <Alert tone="error">{general}</Alert>}
      <Input label="Nombre del complejo" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
      <div className="field">
        <label htmlFor={descId} className="field__label">
          Descripción (opcional)
        </label>
        <textarea id={descId} className="field__control" rows={4} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-invalid={errores.descripcion ? true : undefined} />
        {errores.descripcion && <p className="field__error">{errores.descripcion}</p>}
      </div>
      <Input label="Dirección" maxLength={200} value={direccion} onChange={(e) => setDireccion(e.target.value)} error={errores.direccion} />
      <div className="form__row">
        <Input label="Ciudad" maxLength={80} value={ciudad} onChange={(e) => setCiudad(e.target.value)} error={errores.ciudad} />
        <Input label="Barrio" maxLength={80} value={barrio} onChange={(e) => setBarrio(e.target.value)} error={errores.barrio} />
      </div>
      <div className="form__row">
        <Input label="Teléfono" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} error={errores.telefono} hint="Entre 7 y 15 dígitos; puede iniciar con +." />
        <Input label="Porcentaje de abono (%)" type="number" inputMode="numeric" min={10} max={100} value={abono} onChange={(e) => setAbono(e.target.value)} error={errores.porcentajeAbono} hint="Mínimo 10 %. Por defecto 50 %." />
      </div>
      <fieldset className="services-fieldset">
        <legend className="field__label">Servicios</legend>
        {servicios.isPending && <p className="muted">Cargando servicios…</p>}
        {servicios.isError && <p className="field__error">No pudimos cargar los servicios.</p>}
        <div className="services-grid">
          {(servicios.data?.servicios ?? []).map((s) => (
            <div className="check" key={s.id}>
              <label className="check__label">
                <input type="checkbox" checked={servicioIds.includes(s.id)} onChange={(e) => alternar(s.id, e.target.checked)} />
                <span>{s.nombre}</span>
              </label>
            </div>
          ))}
        </div>
        {errores.servicioIds && <p className="field__error">{errores.servicioIds}</p>}
      </fieldset>
      <Button type="submit" loading={mutacion.isPending}>
        {etiquetaEnvio}
      </Button>
    </form>
  );
}
