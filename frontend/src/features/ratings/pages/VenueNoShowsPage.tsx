import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { obtenerPartido } from '../../matchmaking/api';
import { mensajeError } from '../../venues/utils';
import { confirmarInasistencia, inasistenciasReportadas } from '../api';
import type { ReporteInasistencia } from '../types';

function fechaHora(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);
}

function Reporte({ reporte, complejoId }: { reporte: ReporteInasistencia; complejoId: number }) {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  // Los nombres salen del detalle del partido; si no se pueden leer se muestran los números y el enlace al partido.
  const partido = useQuery({ queryKey: ['partido', reporte.partidoId], queryFn: () => obtenerPartido(reporte.partidoId), retry: false });
  const p = partido.data?.partido;
  const nombre = (id: number): string => {
    if (p?.equipoPublicador.id === id) return p.equipoPublicador.nombre;
    if (p?.equipoRival?.id === id) return p.equipoRival.nombre;
    return `Equipo #${id}`;
  };
  const confirmar = useMutation({
    mutationFn: () => confirmarInasistencia(reporte.id),
    onSuccess: async () => {
      mostrar('Inasistencia confirmada.', 'success');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inasistencias', complejoId] }),
        qc.invalidateQueries({ queryKey: ['equipo'] }),
        qc.invalidateQueries({ queryKey: ['notificaciones'] }),
      ]);
    },
  });
  const yaConfirmado = confirmar.error instanceof ApiError && confirmar.error.codigo === 'REPORTE_YA_CONFIRMADO';

  return (
    <Card className="stack">
      <h2>{nombre(reporte.equipoCalificadoId)} no se presentó</h2>
      <p>
        Reportado por <strong>{nombre(reporte.equipoCalificadorId)}</strong> el {fechaHora(reporte.fecha)}.{' '}
        <Link to={`/partidos/${reporte.partidoId}`}>Ver el partido #{reporte.partidoId}</Link>
      </p>
      {reporte.comentario && <p className="muted">Comentario: {reporte.comentario}</p>}
      {confirmar.isError && <Alert tone={yaConfirmado ? 'info' : 'error'}>{yaConfirmado ? 'Esta inasistencia ya estaba confirmada.' : mensajeError(confirmar.error)}</Alert>}
      <div>
        <Button onClick={() => confirmar.mutate()} loading={confirmar.isPending}>
          Confirmar inasistencia
        </Button>
      </div>
    </Card>
  );
}

/** HU-31: el administrador del complejo confirma las inasistencias reportadas por los equipos. */
export function VenueNoShowsPage() {
  const { id } = useParams();
  const complejoId = Number(id);
  const valido = Number.isInteger(complejoId) && complejoId > 0;
  const consulta = useQuery({ queryKey: ['inasistencias', complejoId], queryFn: () => inasistenciasReportadas(complejoId), enabled: valido });

  return (
    <div className="page page--narrow stack stack--wide">
      <p>
        <Link to={`/mis-complejos/${complejoId}/reservas`}>← Calendario de reservas</Link>
      </p>
      <h1>Inasistencias reportadas</h1>
      <p className="muted">Los equipos reportan cuando su rival no se presentó. Al confirmar, la inasistencia queda en el historial del equipo y puede llevar a una suspensión.</p>
      {consulta.isPending && <Spinner />}
      {consulta.isError && <Alert tone="error">{mensajeError(consulta.error)}</Alert>}
      {consulta.isSuccess && consulta.data.reportes.length === 0 && (
        <Card>
          <p>No hay inasistencias reportadas pendientes.</p>
        </Card>
      )}
      {consulta.isSuccess && consulta.data.reportes.map((r) => <Reporte key={r.id} reporte={r} complejoId={complejoId} />)}
    </div>
  );
}
