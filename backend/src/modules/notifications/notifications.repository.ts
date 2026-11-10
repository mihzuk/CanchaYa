import { query, queryOne } from '../../shared/database/pool';
import { normalizarHora } from '../../shared/utils/time';
import type { NotificacionDto, PreferenciaDto, PreferenciaInput } from './notifications.dto';

/** Único lugar con SQL del módulo notifications. Siempre consultas parametrizadas. */

type NotificacionFila = Omit<NotificacionDto, 'fecha'> & { fecha: Date };
const COLUMNAS = `id, tipo, titulo, mensaje, leida, referencia_tipo AS "referenciaTipo", referencia_id AS "referenciaId", fecha`;
const aNotificacion = (n: NotificacionFila): NotificacionDto => ({ ...n, fecha: n.fecha.toISOString() });

interface PreferenciaFila {
  id: number;
  usuario_id: number;
  equipo_id: number | null;
  dias: string;
  hora_inicio: string;
  hora_fin: string;
  zona: string | null;
  nivel: string | null;
  tipo_futbol: number | null;
  activa: boolean;
}
const aPreferencia = (p: PreferenciaFila): PreferenciaDto => ({
  id: p.id,
  equipoId: p.equipo_id,
  dias: p.dias.split(',').map(Number),
  horaInicio: normalizarHora(p.hora_inicio),
  horaFin: normalizarHora(p.hora_fin),
  zona: p.zona,
  nivel: p.nivel,
  tipoFutbol: p.tipo_futbol,
  activa: p.activa,
});

export const notificationsRepository = {
  /** Devuelve false si ya existía (recordatorios y alertas tienen un índice único que evita duplicados). */
  async crear(usuarioId: number, n: { tipo: string; titulo: string; mensaje: string; referenciaTipo?: string | null; referenciaId?: number | null }): Promise<boolean> {
    const filas = await query(
      `INSERT INTO notificacion (usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id`,
      [usuarioId, n.tipo, n.titulo.slice(0, 120), n.mensaje.slice(0, 500), n.referenciaTipo ?? null, n.referenciaId ?? null],
    );
    return filas.length > 0;
  },

  async listar(usuarioId: number, pagina: number, tamano: number): Promise<NotificacionDto[]> {
    const filas = await query<NotificacionFila>(`SELECT ${COLUMNAS} FROM notificacion WHERE usuario_id = $1 ORDER BY fecha DESC, id DESC LIMIT $2 OFFSET $3`, [usuarioId, tamano, (pagina - 1) * tamano]);
    return filas.map(aNotificacion);
  },

  async contarNoLeidas(usuarioId: number): Promise<number> {
    const fila = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM notificacion WHERE usuario_id = $1 AND NOT leida', [usuarioId]);
    return fila?.n ?? 0;
  },

  /** Solo marca las del propio usuario. */
  async marcarLeida(id: number, usuarioId: number): Promise<boolean> {
    return (await query('UPDATE notificacion SET leida = TRUE WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, usuarioId])).length > 0;
  },

  async marcarTodas(usuarioId: number): Promise<void> {
    await query('UPDATE notificacion SET leida = TRUE WHERE usuario_id = $1 AND NOT leida', [usuarioId]);
  },

  // --- Preferencias (HU-29) -------------------------------------------------------------------

  async preferenciasDe(usuarioId: number): Promise<PreferenciaDto[]> {
    return (await query<PreferenciaFila>('SELECT * FROM preferencia_alerta WHERE usuario_id = $1 ORDER BY id', [usuarioId])).map(aPreferencia);
  },

  async crearPreferencia(usuarioId: number, p: PreferenciaInput): Promise<PreferenciaDto> {
    const fila = await queryOne<PreferenciaFila>(
      `INSERT INTO preferencia_alerta (usuario_id, equipo_id, dias, hora_inicio, hora_fin, zona, nivel, tipo_futbol, activa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [usuarioId, p.equipoId, [...new Set(p.dias)].sort().join(','), p.horaInicio, p.horaFin, p.zona ?? null, p.nivel, p.tipoFutbol, p.activa],
    );
    return aPreferencia(fila!);
  },

  async actualizarPreferencia(id: number, usuarioId: number, p: PreferenciaInput): Promise<PreferenciaDto | undefined> {
    const fila = await queryOne<PreferenciaFila>(
      `UPDATE preferencia_alerta SET equipo_id = $3, dias = $4, hora_inicio = $5, hora_fin = $6, zona = $7, nivel = $8, tipo_futbol = $9, activa = $10
        WHERE id = $1 AND usuario_id = $2 RETURNING *`,
      [id, usuarioId, p.equipoId, [...new Set(p.dias)].sort().join(','), p.horaInicio, p.horaFin, p.zona ?? null, p.nivel, p.tipoFutbol, p.activa],
    );
    return fila && aPreferencia(fila);
  },

  async eliminarPreferencia(id: number, usuarioId: number): Promise<boolean> {
    return (await query('DELETE FROM preferencia_alerta WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, usuarioId])).length > 0;
  },

  async preferenciasActivas(): Promise<(PreferenciaDto & { usuarioId: number })[]> {
    const filas = await query<PreferenciaFila>('SELECT * FROM preferencia_alerta WHERE activa LIMIT 20000');
    return filas.map((p) => ({ ...aPreferencia(p), usuarioId: p.usuario_id }));
  },
};
