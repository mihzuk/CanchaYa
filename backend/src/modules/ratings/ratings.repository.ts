import { query, queryOne } from '../../shared/database/pool';
import type { CalificacionComplejoDto, CalificacionEquipoDto } from './ratings.dto';

/** Único lugar con SQL del módulo ratings. Siempre consultas parametrizadas. */

type FilaComplejo = Omit<CalificacionComplejoDto, 'fecha'> & { fecha: Date };
const COL_COMPLEJO = `id, reserva_id AS "reservaId", usuario_id AS "usuarioId", complejo_id AS "complejoId", estrellas, comentario, fecha`;
const aComplejo = (c: FilaComplejo): CalificacionComplejoDto => ({ ...c, fecha: c.fecha.toISOString() });

type FilaEquipo = Omit<CalificacionEquipoDto, 'fecha'> & { fecha: Date };
const COL_EQUIPO = `id, partido_abierto_id AS "partidoId", equipo_calificador_id AS "equipoCalificadorId", equipo_calificado_id AS "equipoCalificadoId",
                    puntualidad, fair_play AS "fairPlay", no_se_presento AS "noSePresento", confirmado_por_admin AS "confirmadoPorAdmin", comentario, fecha`;
const aEquipo = (c: FilaEquipo): CalificacionEquipoDto => ({ ...c, fecha: c.fecha.toISOString() });

export const ratingsRepository = {
  /** HU-30.2: una por reserva; si existe, se edita. */
  async guardarDeComplejo(d: { reservaId: number; usuarioId: number; complejoId: number; estrellas: number; comentario: string | null }): Promise<CalificacionComplejoDto> {
    const fila = await queryOne<FilaComplejo>(
      `INSERT INTO calificacion_complejo (reserva_id, usuario_id, complejo_id, estrellas, comentario) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (reserva_id) DO UPDATE SET estrellas = EXCLUDED.estrellas, comentario = EXCLUDED.comentario, fecha = now()
       RETURNING ${COL_COMPLEJO}`,
      [d.reservaId, d.usuarioId, d.complejoId, d.estrellas, d.comentario],
    );
    return aComplejo(fila!);
  },

  async deReserva(reservaId: number): Promise<CalificacionComplejoDto | undefined> {
    const f = await queryOne<FilaComplejo>(`SELECT ${COL_COMPLEJO} FROM calificacion_complejo WHERE reserva_id = $1`, [reservaId]);
    return f && aComplejo(f);
  },

  async deComplejo(complejoId: number, pagina: number, tamano: number): Promise<CalificacionComplejoDto[]> {
    const filas = await query<FilaComplejo>(`SELECT ${COL_COMPLEJO} FROM calificacion_complejo WHERE complejo_id = $1 ORDER BY fecha DESC LIMIT $2 OFFSET $3`, [complejoId, tamano, (pagina - 1) * tamano]);
    return filas.map(aComplejo);
  },

  /** HU-30.3 */
  async promediosDeComplejos(ids: number[]): Promise<Map<number, { promedio: number; total: number }>> {
    if (!ids.length) return new Map();
    const filas = await query<{ complejo_id: number; promedio: number; total: number }>(
      'SELECT complejo_id, round(avg(estrellas), 1)::float AS promedio, count(*)::int AS total FROM calificacion_complejo WHERE complejo_id = ANY($1::bigint[]) GROUP BY complejo_id',
      [ids],
    );
    return new Map(filas.map((f) => [f.complejo_id, { promedio: f.promedio, total: f.total }]));
  },

  /** RN-12: una por equipo y partido (la restricción única lo garantiza). */
  async crearDeEquipo(d: { partidoId: number; calificadorId: number; calificadoId: number; puntualidad: number | null; fairPlay: number | null; noSePresento: boolean; comentario: string | null }): Promise<CalificacionEquipoDto> {
    const fila = await queryOne<FilaEquipo>(
      `INSERT INTO calificacion_equipo (partido_abierto_id, equipo_calificador_id, equipo_calificado_id, puntualidad, fair_play, no_se_presento, comentario)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COL_EQUIPO}`,
      [d.partidoId, d.calificadorId, d.calificadoId, d.puntualidad, d.fairPlay, d.noSePresento, d.comentario],
    );
    return aEquipo(fila!);
  },

  async deEquipoEnPartido(partidoId: number, equipoId: number): Promise<CalificacionEquipoDto | undefined> {
    const f = await queryOne<FilaEquipo>(`SELECT ${COL_EQUIPO} FROM calificacion_equipo WHERE partido_abierto_id = $1 AND equipo_calificador_id = $2`, [partidoId, equipoId]);
    return f && aEquipo(f);
  },

  async obtenerDeEquipo(id: number): Promise<CalificacionEquipoDto | undefined> {
    const f = await queryOne<FilaEquipo>(`SELECT ${COL_EQUIPO} FROM calificacion_equipo WHERE id = $1`, [id]);
    return f && aEquipo(f);
  },

  /** Devuelve false si otro administrador la confirmó primero. */
  async marcarConfirmada(id: number): Promise<boolean> {
    return (await query('UPDATE calificacion_equipo SET confirmado_por_admin = TRUE WHERE id = $1 AND NOT confirmado_por_admin RETURNING id', [id])).length > 0;
  },

  async inasistenciasPorConfirmar(partidoIds: number[]): Promise<CalificacionEquipoDto[]> {
    if (!partidoIds.length) return [];
    const filas = await query<FilaEquipo>(`SELECT ${COL_EQUIPO} FROM calificacion_equipo WHERE partido_abierto_id = ANY($1::bigint[]) AND no_se_presento AND NOT confirmado_por_admin ORDER BY fecha`, [partidoIds]);
    return filas.map(aEquipo);
  },

  /** HU-22.2: promedio de fair play de cada equipo. */
  async fairPlayDeEquipos(ids: number[]): Promise<Map<number, number>> {
    if (!ids.length) return new Map();
    const filas = await query<{ equipo_calificado_id: number; promedio: number }>(
      'SELECT equipo_calificado_id, round(avg(fair_play), 1)::float AS promedio FROM calificacion_equipo WHERE equipo_calificado_id = ANY($1::bigint[]) AND fair_play IS NOT NULL GROUP BY equipo_calificado_id',
      [ids],
    );
    return new Map(filas.map((f) => [f.equipo_calificado_id, f.promedio]));
  },
};
