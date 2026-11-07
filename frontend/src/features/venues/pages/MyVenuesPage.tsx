import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { obtenerYo } from '../../auth/api';
import { useAuth } from '../../auth/AuthContext';
import { crearComplejo, misComplejos } from '../api';
import { VenueCard } from '../components/VenueCard';
import { VenueForm } from '../components/VenueForm';
import type { Complejo, ComplejoResumen, EstadoComplejo } from '../types';
import { mensajeError } from '../utils';

const ESTADOS: Record<EstadoComplejo, { texto: string; tone: 'warning' | 'success' | 'danger' }> = {
  pendiente: { texto: 'Pendiente de aprobación', tone: 'warning' },
  activo: { texto: 'Activo', tone: 'success' },
  rechazado: { texto: 'Rechazado', tone: 'danger' },
};

function Estado({ complejo }: { complejo: ComplejoResumen }) {
  const e = ESTADOS[complejo.estado];
  return (
    <div className="venue-status">
      <Badge tone={e.tone}>{e.texto}</Badge>
      {complejo.estado === 'rechazado' && <p className="muted">{complejo.motivoRechazo ? `Motivo: ${complejo.motivoRechazo}` : 'Abre el complejo para ver el motivo del rechazo.'}</p>}
    </div>
  );
}

export function MyVenuesPage() {
  const { usuario, actualizarUsuario } = useAuth();
  const { mostrar } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [registrando, setRegistrando] = useState(false);

  const consulta = useQuery({
    queryKey: ['mis-complejos'],
    queryFn: misComplejos,
    retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2,
  });

  const sinPermiso = consulta.error instanceof ApiError && consulta.error.status === 403;
  const complejos = consulta.data?.complejos ?? [];
  const sinComplejos = sinPermiso || (consulta.isSuccess && complejos.length === 0);
  const mostrarForm = registrando || sinComplejos;

  async function alGuardar(c: Complejo) {
    try {
      // El backend promueve al usuario a AdminComplejo: refrescamos la sesión.
      const r = await obtenerYo();
      actualizarUsuario(r.usuario);
    } catch {
      /* si falla el refresco, el rol se actualizará en el próximo ingreso */
    }
    await qc.invalidateQueries({ queryKey: ['mis-complejos'] });
    mostrar('Complejo registrado. Quedó pendiente de aprobación.', 'success');
    void navigate(`/mis-complejos/${c.id}`);
  }

  return (
    <div className="page stack stack--wide">
      <h1>Mis complejos</h1>

      {consulta.isPending && <Spinner />}
      {consulta.isError && !sinPermiso && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}

      {complejos.length > 0 && (
        <ul className="card-grid">
          {complejos.map((c) => (
            <li key={c.id} className="venue-item">
              <VenueCard complejo={c} to={`/mis-complejos/${c.id}`} />
              <Estado complejo={c} />
              <div className="row-actions">
                <Link className="btn btn--primary" to={`/mis-complejos/${c.id}`}>
                  Administrar
                </Link>
                {c.estado === 'activo' && (
                  <Link className="btn btn--secondary" to={`/complejos/${c.id}`}>
                    Ver ficha pública
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {sinComplejos && <p>Aún no tienes complejos. Registra el primero para empezar a recibir reservas.</p>}

      {!mostrarForm && (
        <Button onClick={() => setRegistrando(true)}>Registrar un complejo</Button>
      )}

      {mostrarForm && !consulta.isPending && (
        <Card className="card--wide">
          <h2>Registrar un complejo</h2>
          <p className="muted">Tu complejo será revisado por el equipo de CanchaYa antes de aparecer en las búsquedas.</p>
          {usuario && !usuario.correoVerificado ? (
            <Alert tone="info">
              Para registrar un complejo primero confirma tu correo. Revisa tu bandeja de entrada o usa el botón
              «Reenviar correo de verificación» de la parte superior.
            </Alert>
          ) : (
            <VenueForm etiquetaEnvio="Registrar complejo" onEnviar={async (d) => (await crearComplejo(d)).complejo} onGuardado={(c) => void alGuardar(c)} />
          )}
          {registrando && !sinComplejos && (
            <Button variant="ghost" onClick={() => setRegistrando(false)}>
              Cancelar
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
