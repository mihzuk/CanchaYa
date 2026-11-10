import { useId } from 'react';
import { textoPromedio } from '../types';
import type { ResumenCalificacion } from '../types';

const ESTRELLAS = [1, 2, 3, 4, 5] as const;

interface InputProps {
  /** Nombre visible del grupo, por ejemplo "Calificación". */
  etiqueta: string;
  valor: number;
  onChange: (valor: number) => void;
  disabled?: boolean;
  error?: string | undefined;
}

/** Selector de 1 a 5 estrellas: grupo de radios nativos (teclado con flechas, lector de pantalla con "N estrellas"). */
export function StarRatingInput({ etiqueta, valor, onChange, disabled = false, error }: InputProps) {
  const nombre = useId();
  return (
    <fieldset className="stars-field">
      <legend>{etiqueta}</legend>
      <div className="stars" role="radiogroup" aria-label={etiqueta}>
        {ESTRELLAS.map((n) => (
          <label key={n} className={`stars__star${n <= valor ? ' is-on' : ''}`}>
            <input type="radio" name={nombre} value={n} checked={valor === n} disabled={disabled} onChange={() => onChange(n)} />
            <span className="sr-only">{n === 1 ? '1 estrella' : `${n} estrellas`}</span>
            <span aria-hidden="true">{n <= valor ? '★' : '☆'}</span>
          </label>
        ))}
      </div>
      {error && <p className="field__error">{error}</p>}
    </fieldset>
  );
}

/** Estrellas de solo lectura con texto accesible. */
export function StarRatingDisplay({ resumen, estrellas, compacto = false }: { resumen?: ResumenCalificacion | null; estrellas?: number; compacto?: boolean }) {
  const valor = estrellas ?? resumen?.promedio ?? 0;
  const redondeado = Math.round(valor);
  const texto = estrellas !== undefined ? `${estrellas} de 5 estrellas` : textoPromedio(resumen);
  const sin = estrellas === undefined && (!resumen || resumen.total === 0);
  return (
    <span className="stars-display" role="img" aria-label={texto}>
      <span className="stars-display__icons" aria-hidden="true">
        {ESTRELLAS.map((n) => (
          <span key={n} className={n <= redondeado && !sin ? 'is-on' : ''}>
            {n <= redondeado && !sin ? '★' : '☆'}
          </span>
        ))}
      </span>
      {!compacto && estrellas === undefined && (
        <span className="muted" aria-hidden="true">
          {' '}
          {texto}
        </span>
      )}
      {compacto && (
        <span className="muted" aria-hidden="true">
          {' '}
          {sin ? 'Sin calificaciones' : `${resumen?.promedio.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${resumen?.total})`}
        </span>
      )}
    </span>
  );
}
