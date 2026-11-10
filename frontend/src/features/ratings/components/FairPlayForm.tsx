import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { mensajeError } from '../../venues/utils';
import { calificarEquipoRival, miCalificacionDePartido } from '../api';
import type { CalificacionEquipoInput } from '../types';
import { StarRatingInput } from './StarRating';

interface Props {
  partidoId: number;
  /** Equipo propio (el que califica). */
  equipoId: number;
  nombreRival: string;
}

export function FairPlayForm({ partidoId, equipoId, nombreRival }: Props) {
  const qc = useQueryClient();
  const previa = useQuery({ queryKey: ['partido', partidoId, 'mi-calificacion'], queryFn: () => miCalificacionDePartido(partidoId) });
  const [noSePresento, setNoSePresento] = useState(false);
  const [puntualidad, setPuntualidad] = useState(0);
  const [fairPlay, setFairPlay] = useState(0);
  const [comentario, setComentario] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: (d: CalificacionEquipoInput) => calificarEquipoRival(partidoId, d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['partido', partidoId] });
      void qc.invalidateQueries({ queryKey: ['partidos'] });
      void qc.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorLocal(null);
    const c = comentario.trim();
    if (noSePresento) {
      m.mutate({ noSePresento: true, equipoId, ...(c ? { comentario: c } : {}) });
      return;
    }
    if (puntualidad < 1 || fairPlay < 1) {
      setErrorLocal('Elige de 1 a 5 estrellas en puntualidad y en fair play.');
      return;
    }
    m.mutate({ noSePresento: false, equipoId, puntualidad, fairPlay, ...(c ? { comentario: c } : {}) });
  }

  if (m.isSuccess) {
    return <Alert tone="success">¡Gracias! Tu calificación de {nombreRival} quedó registrada.</Alert>;
  }

  if (previa.data?.calificacion) {
    return <Alert tone="info">{previa.data.calificacion.noSePresento ? `Ya reportaste que ${nombreRival} no se presentó.` : `Ya calificaste a ${nombreRival} en este partido.`}</Alert>;
  }

  const yaCalificado = m.error instanceof ApiError && m.error.codigo === 'YA_CALIFICADO';

  return (
    <form className="form" onSubmit={enviar} noValidate aria-label="Calificar al equipo rival">
      <p className="muted">Califica a {nombreRival}. Solo puedes hacerlo una vez.</p>
      {m.isError && <Alert tone={yaCalificado ? 'info' : 'error'}>{yaCalificado ? 'Ya calificaste a este equipo en este partido.' : mensajeError(m.error)}</Alert>}
      {errorLocal && <Alert tone="error">{errorLocal}</Alert>}
      <div className="check">
        <label className="check__label">
          <input type="checkbox" checked={noSePresento} onChange={(e) => setNoSePresento(e.target.checked)} />
          <span>No se presentó</span>
        </label>
        {noSePresento && <p className="field__hint">Se reportará la inasistencia al complejo para que la confirme.</p>}
      </div>
      {!noSePresento && (
        <>
          <StarRatingInput etiqueta="Puntualidad" valor={puntualidad} onChange={setPuntualidad} />
          <StarRatingInput etiqueta="Fair play" valor={fairPlay} onChange={setFairPlay} />
        </>
      )}
      <div className="field">
        <label className="field__label" htmlFor={`comentario-equipo-${partidoId}`}>
          Comentario (opcional)
        </label>
        <textarea id={`comentario-equipo-${partidoId}`} className="field__control" rows={3} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </div>
      <Button type="submit" loading={m.isPending}>
        Enviar calificación
      </Button>
    </form>
  );
}
