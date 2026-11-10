import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner } from '../../../components/ui';
import { mensajeError } from '../../venues/utils';
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from '../api';
import { rutaDeNotificacion } from '../types';
import type { Notificacion } from '../types';

const TAMANO = 20;

function fechaHora(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [paginas, setPaginas] = useState(1);
  const consulta = useQuery({ queryKey: ['notificaciones', 'lista', paginas], queryFn: () => listarNotificaciones(1, TAMANO * paginas) });

  const refrescar = () => qc.invalidateQueries({ queryKey: ['notificaciones'] });
  const leer = useMutation({ mutationFn: (id: number) => marcarLeida(id), onSuccess: refrescar });
  const leerTodas = useMutation({ mutationFn: marcarTodasLeidas, onSuccess: refrescar });

  async function abrir(n: Notificacion) {
    const ruta = rutaDeNotificacion(n);
    if (!n.leida) {
      try {
        await leer.mutateAsync(n.id);
      } catch {
        return; // el error se muestra arriba
      }
    }
    if (ruta) void navigate(ruta);
  }

  const lista = consulta.data?.notificaciones ?? [];
  const noLeidas = consulta.data?.noLeidas ?? 0;

  return (
    <div className="page page--narrow stack stack--wide">
      <h1>Notificaciones</h1>
      <div className="row-actions">
        <Button variant="secondary" onClick={() => leerTodas.mutate()} loading={leerTodas.isPending} disabled={noLeidas === 0}>
          Marcar todas como leídas
        </Button>
        <Link className="btn btn--secondary" to="/notificaciones/alertas">
          Mis alertas de partidos
        </Link>
      </div>
      {consulta.isSuccess && <p className="muted">{noLeidas === 0 ? 'No tienes notificaciones sin leer.' : `Tienes ${noLeidas} sin leer.`}</p>}
      {consulta.isPending && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {leer.isError && <Alert tone="error">{mensajeError(leer.error)}</Alert>}
      {leerTodas.isError && <Alert tone="error">{mensajeError(leerTodas.error)}</Alert>}
      {consulta.isSuccess && lista.length === 0 && (
        <Card>
          <p>Aún no tienes notificaciones.</p>
        </Card>
      )}
      {lista.length > 0 && (
        <ul className="notif-list">
          {lista.map((n) => (
            <li key={n.id}>
              <button type="button" className={`notif${n.leida ? '' : ' notif--nueva'}`} onClick={() => void abrir(n)}>
                <span className="notif__head">
                  <strong>{n.titulo}</strong>
                  {!n.leida && <Badge tone="info">Nueva</Badge>}
                </span>
                <span>{n.mensaje}</span>
                <span className="muted notif__fecha">{fechaHora(n.fecha)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length >= TAMANO * paginas && (
        <div>
          <Button variant="ghost" onClick={() => setPaginas((p) => p + 1)} loading={consulta.isFetching}>
            Ver más
          </Button>
        </div>
      )}
    </div>
  );
}
