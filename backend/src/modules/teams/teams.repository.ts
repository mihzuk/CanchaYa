import { query, queryOne, type Queryable } from '../../shared/database/pool';
import type { CrearEquipoDto, EquipoDto, NivelEquipo } from './teams.dto';

/** Único lugar con SQL del módulo teams. Siempre consultas parametrizadas. */

interface EquipoFila {
  id: number;
  nombre: string;
  escudo_url: string | null;
  nivel: NivelEquipo;
  tipo_futbol: number;
  estado: 'activo' | 'inactivo';
  capitan_id: number;
  capitan_propuesto_id: number | null;
  inasistencias: number;
  suspendido_hasta: Date | null;
  fecha_creacion: Date;
  total_miembros: number;
}

const SELECT_EQUIPO = `
  SELECT e.*, (SELECT count(*)::int FROM miembro_equipo m WHERE m.equipo_id = e.id) AS total_miembros
    FROM equipo e`;

const aDto = (e: EquipoFila): EquipoDto => ({
  id: e.id,
  nombre: e.nombre,
  escudoUrl: e.escudo_url,
  nivel: e.nivel,
  tipoFutbol: e.tipo_futbol,
  estado: e.estado,
  capitanId: e.capitan_id,
  capitanPropuestoId: e.capitan_propuesto_id,
  inasistencias: e.inasistencias,
  suspendidoHasta: e.suspendido_hasta?.toISOString() ?? null,
  fechaCreacion: e.fecha_creacion.toISOString(),
  totalMiembros: e.total_miembros,
});

export interface InvitacionFila {
  id: number;
  equipo_id: number;
  usuario_invitado_id: number | null;
  por_enlace: boolean;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  fecha: Date;
}
const COLUMNAS_INVITACION = 'id, equipo_id, usuario_invitado_id, token_enlace IS NOT NULL AS por_enlace, estado, fecha';

export const teamsRepository = {
  async crear(capitanId: number, d: CrearEquipoDto, db: Queryable): Promise<number> {
    const fila = await queryOne<{ id: number }>(
      'INSERT INTO equipo (capitan_id, nombre, escudo_url, nivel, tipo_futbol) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [capitanId, d.nombre, d.escudoUrl, d.nivel, d.tipoFutbol],
      db,
    );
    return fila!.id;
  },

  async obtener(id: number, db?: Queryable, paraActualizar = false): Promise<EquipoDto | undefined> {
    const fila = await queryOne<EquipoFila>(`${SELECT_EQUIPO} WHERE e.id = $1 ${paraActualizar ? 'FOR UPDATE OF e' : ''}`, [id], db);
    return fila ? aDto(fila) : undefined;
  },

  async porIds(ids: number[], db?: Queryable): Promise<EquipoDto[]> {
    if (!ids.length) return [];
    return (await query<EquipoFila>(`${SELECT_EQUIPO} WHERE e.id = ANY($1::bigint[])`, [ids], db)).map(aDto);
  },

  async deUsuario(usuarioId: number): Promise<EquipoDto[]> {
    const filas = await query<EquipoFila>(
      `${SELECT_EQUIPO} JOIN miembro_equipo mi ON mi.equipo_id = e.id
        WHERE mi.usuario_id = $1 AND e.estado = 'activo' ORDER BY e.nombre`,
      [usuarioId],
    );
    return filas.map(aDto);
  },

  async idsCapitaneados(usuarioId: number): Promise<number[]> {
    const filas = await query<{ id: number }>("SELECT id FROM equipo WHERE capitan_id = $1 AND estado = 'activo'", [usuarioId]);
    return filas.map((f) => f.id);
  },

  async actualizar(id: number, escudoUrl: string | null, nivel: NivelEquipo): Promise<void> {
    await query('UPDATE equipo SET escudo_url = $2, nivel = $3 WHERE id = $1', [id, escudoUrl, nivel]);
  },

  async inactivar(id: number, db: Queryable): Promise<void> {
    await query("UPDATE equipo SET estado = 'inactivo', capitan_propuesto_id = NULL WHERE id = $1", [id], db);
  },

  // --- Miembros -------------------------------------------------------------------------------

  miembros(equipoId: number, db?: Queryable) {
    return query<{ usuario_id: number; rol_en_equipo: 'capitan' | 'miembro'; fecha_ingreso: Date }>(
      'SELECT usuario_id, rol_en_equipo, fecha_ingreso FROM miembro_equipo WHERE equipo_id = $1 ORDER BY rol_en_equipo, fecha_ingreso',
      [equipoId],
      db,
    );
  },

  async esMiembro(equipoId: number, usuarioId: number, db?: Queryable): Promise<boolean> {
    const fila = await queryOne<{ hay: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM miembro_equipo WHERE equipo_id = $1 AND usuario_id = $2) AS hay',
      [equipoId, usuarioId],
      db,
    );
    return fila?.hay ?? false;
  },

  /** Devuelve false si ya era miembro. */
  async agregarMiembro(equipoId: number, usuarioId: number, rol: 'capitan' | 'miembro', db: Queryable): Promise<boolean> {
    const filas = await query(
      `INSERT INTO miembro_equipo (equipo_id, usuario_id, rol_en_equipo) VALUES ($1, $2, $3)
       ON CONFLICT (equipo_id, usuario_id) DO NOTHING RETURNING id`,
      [equipoId, usuarioId, rol],
      db,
    );
    return filas.length > 0;
  },

  async quitarMiembro(equipoId: number, usuarioId: number, db: Queryable): Promise<boolean> {
    const filas = await query('DELETE FROM miembro_equipo WHERE equipo_id = $1 AND usuario_id = $2 RETURNING id', [equipoId, usuarioId], db);
    return filas.length > 0;
  },

  async proponerCapitan(equipoId: number, usuarioId: number | null, db: Queryable): Promise<void> {
    await query('UPDATE equipo SET capitan_propuesto_id = $2 WHERE id = $1', [equipoId, usuarioId], db);
  },

  /** `capitan_id` es la fuente de verdad; `rol_en_equipo` la refleja. */
  async cambiarCapitan(equipoId: number, nuevoId: number, db: Queryable): Promise<void> {
    await query('UPDATE equipo SET capitan_id = $2, capitan_propuesto_id = NULL WHERE id = $1', [equipoId, nuevoId], db);
    await query(
      "UPDATE miembro_equipo SET rol_en_equipo = CASE WHEN usuario_id = $2 THEN 'capitan' ELSE 'miembro' END WHERE equipo_id = $1",
      [equipoId, nuevoId],
      db,
    );
  },

  // --- Invitaciones ---------------------------------------------------------------------------

  async crearInvitacion(equipoId: number, d: { usuarioId?: number; tokenHash?: string }, db?: Queryable): Promise<number> {
    const fila = await queryOne<{ id: number }>(
      'INSERT INTO invitacion_equipo (equipo_id, usuario_invitado_id, token_enlace) VALUES ($1, $2, $3) RETURNING id',
      [equipoId, d.usuarioId ?? null, d.tokenHash ?? null],
      db,
    );
    return fila!.id;
  },

  async hayInvitacionPendiente(equipoId: number, usuarioId: number): Promise<boolean> {
    const fila = await queryOne<{ hay: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM invitacion_equipo WHERE equipo_id = $1 AND usuario_invitado_id = $2 AND estado = 'pendiente') AS hay",
      [equipoId, usuarioId],
    );
    return fila?.hay ?? false;
  },

  obtenerInvitacion(id: number, db?: Queryable, paraActualizar = false) {
    return queryOne<InvitacionFila>(`SELECT ${COLUMNAS_INVITACION} FROM invitacion_equipo WHERE id = $1 ${paraActualizar ? 'FOR UPDATE' : ''}`, [id], db);
  },

  invitacionPorToken(tokenHash: string) {
    return queryOne<InvitacionFila>(`SELECT ${COLUMNAS_INVITACION} FROM invitacion_equipo WHERE token_enlace = $1`, [tokenHash]);
  },

  invitacionesDeUsuario(usuarioId: number) {
    return query<InvitacionFila>(
      `SELECT ${COLUMNAS_INVITACION} FROM invitacion_equipo WHERE usuario_invitado_id = $1 AND estado = 'pendiente' ORDER BY fecha DESC`,
      [usuarioId],
    );
  },

  invitacionesDeEquipo(equipoId: number) {
    return query<InvitacionFila>(`SELECT ${COLUMNAS_INVITACION} FROM invitacion_equipo WHERE equipo_id = $1 AND estado = 'pendiente' ORDER BY fecha DESC`, [equipoId]);
  },

  /** HU-21.1: al expulsar se anulan los enlaces del equipo y las invitaciones pendientes del expulsado. */
  async revocarAccesosTrasExpulsion(equipoId: number, usuarioId: number, db: Queryable): Promise<void> {
    await query(
      `UPDATE invitacion_equipo SET estado = 'rechazada'
        WHERE equipo_id = $1 AND estado = 'pendiente' AND (token_enlace IS NOT NULL OR usuario_invitado_id = $2)`,
      [equipoId, usuarioId],
      db,
    );
  },

  async cambiarEstadoInvitacion(id: number, estado: 'aceptada' | 'rechazada', db?: Queryable): Promise<void> {
    await query('UPDATE invitacion_equipo SET estado = $2 WHERE id = $1', [id, estado], db);
  },
};
