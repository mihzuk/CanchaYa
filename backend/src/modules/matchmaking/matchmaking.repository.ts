import { query, queryOne, type Queryable } from '../../shared/database/pool';
import { normalizarHora } from '../../shared/utils/time';
import type { EstadoPartido, ModalidadPartido } from './matchmaking.dto';

/** Único lugar con SQL del módulo matchmaking. Siempre consultas parametrizadas. */

export interface PartidoFila {
  id: number;
  reserva_id: number | null;
  equipo_publicador_id: number;
  equipo_rival_id: number | null;
  modalidad: ModalidadPartido;
  nivel_buscado: string;
  fecha_preferida: string | null;
  rango_hora_inicio: string | null;
  rango_hora_fin: string | null;
  zona: string | null;
  cupos_disponibles: number | null;
  aporte_por_jugador: number | null;
  posicion_deseada: string | null;
  porcentaje_pago_rival: number;
  aceptacion_automatica: boolean;
  descripcion: string | null;
  estado: EstadoPartido;
  goles_publicador: number | null;
  goles_rival: number | null;
  marcador_conf_publicador: boolean;
  marcador_conf_rival: boolean;
  fecha_rival_confirmado: Date | null;
  alerta_sin_rival_enviada: boolean;
  fecha_publicacion: Date;
}

export interface PostulacionFila {
  id: number;
  partido_abierto_id: number;
  equipo_id: number;
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'anulada';
  fecha: Date;
}

export interface InscripcionFila {
  id: number;
  partido_abierto_id: number;
  usuario_id: number;
  posicion: string | null;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  fecha: Date;
}

/** Estados en los que un partido ocupa el horario del equipo (RN-11). */
const ESTADOS_ACTIVOS = "('buscando', 'rival_confirmado', 'completo')";

const normalizar = (p: PartidoFila): PartidoFila => ({
  ...p,
  rango_hora_inicio: p.rango_hora_inicio && normalizarHora(p.rango_hora_inicio),
  rango_hora_fin: p.rango_hora_fin && normalizarHora(p.rango_hora_fin),
});

export const matchmakingRepository = {
  async crear(
    d: {
      reservaId: number | null;
      equipoId: number;
      modalidad: ModalidadPartido;
      nivelBuscado: string;
      descripcion: string | null;
      fechaPreferida?: string | null;
      rangoHoraInicio?: string | null;
      rangoHoraFin?: string | null;
      zona?: string | null;
      cupos?: number | null;
      aporte?: number | null;
      posicionDeseada?: string | null;
      porcentajePagoRival?: number;
      aceptacionAutomatica?: boolean;
    },
    db: Queryable,
  ): Promise<number> {
    const fila = await queryOne<{ id: number }>(
      `INSERT INTO partido_abierto (reserva_id, equipo_publicador_id, modalidad, nivel_buscado, descripcion, fecha_preferida,
                                    rango_hora_inicio, rango_hora_fin, zona, cupos_disponibles, aporte_por_jugador,
                                    porcentaje_pago_rival, aceptacion_automatica, posicion_deseada)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        d.reservaId, d.equipoId, d.modalidad, d.nivelBuscado, d.descripcion, d.fechaPreferida ?? null, d.rangoHoraInicio ?? null,
        d.rangoHoraFin ?? null, d.zona ?? null, d.cupos ?? null, d.aporte ?? null, d.porcentajePagoRival ?? 50, d.aceptacionAutomatica ?? false, d.posicionDeseada ?? null,
      ],
      db,
    );
    return fila!.id;
  },

  async obtener(id: number, db?: Queryable, paraActualizar = false): Promise<PartidoFila | undefined> {
    const f = await queryOne<PartidoFila>(`SELECT * FROM partido_abierto WHERE id = $1 ${paraActualizar ? 'FOR UPDATE' : ''}`, [id], db);
    return f && normalizar(f);
  },

  /** HU-23: partidos abiertos (el filtrado por lugar y hora se hace con los datos de la reserva). */
  async buscando(): Promise<PartidoFila[]> {
    return (await query<PartidoFila>("SELECT * FROM partido_abierto WHERE estado = 'buscando' ORDER BY fecha_publicacion DESC LIMIT 1000")).map(normalizar);
  },

  async deEquipo(equipoId: number): Promise<PartidoFila[]> {
    const filas = await query<PartidoFila>(
      `SELECT * FROM partido_abierto WHERE equipo_publicador_id = $1 OR equipo_rival_id = $1 ORDER BY fecha_publicacion DESC LIMIT 200`,
      [equipoId],
    );
    return filas.map(normalizar);
  },

  /** RN-11: reservas de los partidos activos del equipo. */
  async reservasActivasDeEquipo(equipoId: number, excluirPartidoId: number | null, db: Queryable): Promise<number[]> {
    const filas = await query<{ reserva_id: number }>(
      `SELECT reserva_id FROM partido_abierto
        WHERE (equipo_publicador_id = $1 OR equipo_rival_id = $1) AND reserva_id IS NOT NULL
          AND estado IN ${ESTADOS_ACTIVOS} AND ($2::bigint IS NULL OR id <> $2)`,
      [equipoId, excluirPartidoId],
      db,
    );
    return filas.map((f) => f.reserva_id);
  },

  /** HU-23.3: últimos resultados del equipo. */
  ultimosResultados(equipoId: number, limite = 5) {
    return query<{ id: number; equipo_publicador_id: number; equipo_rival_id: number; goles_publicador: number | null; goles_rival: number | null; fecha_publicacion: Date; reserva_id: number | null }>(
      `SELECT id, equipo_publicador_id, equipo_rival_id, goles_publicador, goles_rival, fecha_publicacion, reserva_id FROM partido_abierto
        WHERE (equipo_publicador_id = $1 OR equipo_rival_id = $1) AND estado = 'jugado'
        ORDER BY fecha_publicacion DESC LIMIT $2`,
      [equipoId, limite],
    );
  },

  /** HU-10.2: reservas con un partido abierto buscando rival o jugadores (amarillo en la grilla). */
  async reservasConPartido(reservaIds: number[]): Promise<Set<number>> {
    if (!reservaIds.length) return new Set();
    const filas = await query<{ reserva_id: number }>(
      "SELECT reserva_id FROM partido_abierto WHERE reserva_id = ANY($1::bigint[]) AND estado = 'buscando'",
      [reservaIds],
    );
    return new Set(filas.map((f) => f.reserva_id));
  },

  async confirmarRival(id: number, equipoRivalId: number, reservaId: number | null, db: Queryable): Promise<void> {
    await query(
      `UPDATE partido_abierto SET estado = 'rival_confirmado', equipo_rival_id = $2, reserva_id = COALESCE($3, reserva_id), fecha_rival_confirmado = now()
        WHERE id = $1`,
      [id, equipoRivalId, reservaId],
      db,
    );
  },

  async actualizarCupos(id: number, cupos: number, estado: EstadoPartido, db: Queryable): Promise<void> {
    await query('UPDATE partido_abierto SET cupos_disponibles = $2, estado = $3 WHERE id = $1', [id, cupos, estado], db);
  },

  async cancelar(id: number, db: Queryable): Promise<void> {
    await query("UPDATE partido_abierto SET estado = 'cancelado' WHERE id = $1", [id], db);
    await query("UPDATE postulacion_rival SET estado = 'rechazada' WHERE partido_abierto_id = $1 AND estado = 'pendiente'", [id], db);
    await query("UPDATE inscripcion_jugador SET estado = 'rechazada' WHERE partido_abierto_id = $1 AND estado = 'pendiente'", [id], db);
  },

  /** Cierra un partido ya jugado (la reserva se completó). */
  async marcarJugado(id: number, db: Queryable): Promise<void> {
    await query("UPDATE partido_abierto SET estado = 'jugado' WHERE id = $1", [id], db);
  },

  /** HU-26.2: rivales confirmados antes de `limite` (posibles morosos). */
  async rivalesConfirmadosAntesDe(limite: Date): Promise<PartidoFila[]> {
    return (await query<PartidoFila>("SELECT * FROM partido_abierto WHERE estado = 'rival_confirmado' AND fecha_rival_confirmado <= $1 ORDER BY id LIMIT 500", [limite])).map(normalizar);
  },

  /** HU-22.3: partidos que aún buscan rival y no han recibido la alerta. */
  async buscandoSinAlerta(): Promise<PartidoFila[]> {
    return (await query<PartidoFila>("SELECT * FROM partido_abierto WHERE estado = 'buscando' AND modalidad = 'busco_rival' AND NOT alerta_sin_rival_enviada")).map(normalizar);
  },

  /** Devuelve false si otra ejecución ya la marcó (la alerta sale una sola vez). */
  async marcarAlertaEnviada(id: number): Promise<boolean> {
    return (await query('UPDATE partido_abierto SET alerta_sin_rival_enviada = TRUE WHERE id = $1 AND NOT alerta_sin_rival_enviada RETURNING id', [id])).length > 0;
  },

  /** HU-31.4 */
  async guardarMarcador(id: number, goles: { publicador: number; rival: number }, conf: { publicador: boolean; rival: boolean }, db: Queryable): Promise<void> {
    await query(
      'UPDATE partido_abierto SET goles_publicador = $2, goles_rival = $3, marcador_conf_publicador = $4, marcador_conf_rival = $5 WHERE id = $1',
      [id, goles.publicador, goles.rival, conf.publicador, conf.rival],
      db,
    );
  },

  /** RN-07 / RN-08: una por equipo y partido. Devuelve false si ya estaba registrada. */
  async registrarInasistencia(equipoId: number, partidoId: number, db: Queryable): Promise<boolean> {
    const filas = await query('INSERT INTO inasistencia_equipo (equipo_id, partido_abierto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id', [equipoId, partidoId], db);
    return filas.length > 0;
  },

  async fechasInasistencia(equipoId: number, db: Queryable): Promise<Date[]> {
    return (await query<{ fecha: Date }>('SELECT fecha FROM inasistencia_equipo WHERE equipo_id = $1 AND cuenta', [equipoId], db)).map((f) => f.fecha);
  },

  /** RN-08: las inasistencias que causaron una suspensión ya se cumplieron con ella. */
  async consumirInasistencias(equipoId: number, db: Queryable): Promise<void> {
    await query('UPDATE inasistencia_equipo SET cuenta = FALSE WHERE equipo_id = $1 AND cuenta', [equipoId], db);
  },

  async partidoDeReserva(reservaId: number): Promise<PartidoFila | undefined> {
    const f = await queryOne<PartidoFila>(`SELECT * FROM partido_abierto WHERE reserva_id = $1 AND estado IN ${ESTADOS_ACTIVOS}`, [reservaId]);
    return f && normalizar(f);
  },

  /** Partidos de varias reservas, en cualquier estado (panel del complejo). */
  async idsPorReservas(reservaIds: number[]): Promise<number[]> {
    if (!reservaIds.length) return [];
    return (await query<{ id: number }>('SELECT id FROM partido_abierto WHERE reserva_id = ANY($1::bigint[])', [reservaIds])).map((f) => f.id);
  },

  /** Reconciliación: partidos activos con su reserva. */
  activosConReserva() {
    return query<{ id: number; reserva_id: number }>(`SELECT id, reserva_id FROM partido_abierto WHERE reserva_id IS NOT NULL AND estado IN ${ESTADOS_ACTIVOS}`);
  },

  /** Partidos activos donde participa un equipo (bloqueados), para retirarlo cuando se inactiva. */
  activosDeEquipo(equipoId: number, db: Queryable) {
    return query<PartidoFila>(
      `SELECT * FROM partido_abierto WHERE (equipo_publicador_id = $1 OR equipo_rival_id = $1) AND estado IN ${ESTADOS_ACTIVOS} FOR UPDATE`,
      [equipoId],
      db,
    );
  },

  /** El rival confirmado se retira: el partido vuelve a buscar rival. */
  async liberarRival(id: number, equipoId: number, db: Queryable): Promise<void> {
    // En "sin cancha" la reserva era del rival: se va con él.
    await query(
      `UPDATE partido_abierto SET estado = 'buscando', equipo_rival_id = NULL, fecha_rival_confirmado = NULL,
              reserva_id = CASE WHEN modalidad = 'busco_partido_sin_cancha' THEN NULL ELSE reserva_id END
        WHERE id = $1`,
      [id],
      db,
    );
    await query("UPDATE postulacion_rival SET estado = 'anulada' WHERE partido_abierto_id = $1 AND equipo_id = $2 AND estado = 'aceptada'", [id, equipoId], db);
  },

  async anularPostulacionesPendientes(equipoId: number, db: Queryable): Promise<void> {
    await query("UPDATE postulacion_rival SET estado = 'anulada' WHERE equipo_id = $1 AND estado = 'pendiente'", [equipoId], db);
  },

  async jugadoresAceptados(partidoId: number, db: Queryable): Promise<number[]> {
    const filas = await query<{ usuario_id: number }>("SELECT usuario_id FROM inscripcion_jugador WHERE partido_abierto_id = $1 AND estado = 'aceptada'", [partidoId], db);
    return filas.map((f) => f.usuario_id);
  },

  /** HU-12.4: partidos activos de una reserva que dejó de existir. Bloquea la fila para cancelarla. */
  activoDeReserva(reservaId: number, db: Queryable) {
    return queryOne<PartidoFila>(`SELECT * FROM partido_abierto WHERE reserva_id = $1 AND estado IN ${ESTADOS_ACTIVOS} FOR UPDATE`, [reservaId], db);
  },

  // --- Postulaciones (HU-24) ------------------------------------------------------------------

  /** Una postulación anulada se puede renovar; una pendiente, aceptada o rechazada no. */
  crearPostulacion(partidoId: number, equipoId: number, db: Queryable) {
    return queryOne<PostulacionFila>(
      `INSERT INTO postulacion_rival (partido_abierto_id, equipo_id) VALUES ($1, $2)
       ON CONFLICT (partido_abierto_id, equipo_id) DO UPDATE SET estado = 'pendiente', fecha = now()
         WHERE postulacion_rival.estado = 'anulada'
       RETURNING *`,
      [partidoId, equipoId],
      db,
    );
  },

  obtenerPostulacion(id: number, db?: Queryable) {
    return queryOne<PostulacionFila>('SELECT * FROM postulacion_rival WHERE id = $1', [id], db);
  },

  postulacionesDePartido(partidoId: number) {
    return query<PostulacionFila>('SELECT * FROM postulacion_rival WHERE partido_abierto_id = $1 ORDER BY fecha', [partidoId]);
  },

  async cambiarEstadoPostulacion(id: number, estado: PostulacionFila['estado'], db: Queryable): Promise<void> {
    await query('UPDATE postulacion_rival SET estado = $2 WHERE id = $1', [id, estado], db);
  },

  /** HU-24.2: al confirmar un rival, las demás solicitudes se rechazan. Devuelve las rechazadas. */
  rechazarDemasPostulaciones(partidoId: number, aceptadaId: number, db: Queryable) {
    return query<{ equipo_id: number }>(
      "UPDATE postulacion_rival SET estado = 'rechazada' WHERE partido_abierto_id = $1 AND id <> $2 AND estado = 'pendiente' RETURNING equipo_id",
      [partidoId, aceptadaId],
      db,
    );
  },

  // --- Inscripciones (HU-25) ------------------------------------------------------------------

  crearInscripcion(partidoId: number, usuarioId: number, posicion: string | null, db: Queryable) {
    return queryOne<InscripcionFila>(
      `INSERT INTO inscripcion_jugador (partido_abierto_id, usuario_id, posicion) VALUES ($1, $2, $3)
       ON CONFLICT (partido_abierto_id, usuario_id) DO UPDATE SET estado = 'pendiente', posicion = EXCLUDED.posicion, fecha = now()
         WHERE inscripcion_jugador.estado = 'rechazada'
       RETURNING *`,
      [partidoId, usuarioId, posicion],
      db,
    );
  },

  inscripcionDeUsuario(partidoId: number, usuarioId: number) {
    return queryOne<InscripcionFila>('SELECT * FROM inscripcion_jugador WHERE partido_abierto_id = $1 AND usuario_id = $2', [partidoId, usuarioId]);
  },

  /** La solicitud de cualquiera de estos equipos a este partido (HU-24). */
  postulacionDeEquipos(partidoId: number, equipoIds: number[]) {
    return queryOne<PostulacionFila>(
      "SELECT * FROM postulacion_rival WHERE partido_abierto_id = $1 AND equipo_id = ANY($2::bigint[]) AND estado <> 'anulada' ORDER BY fecha DESC LIMIT 1",
      [partidoId, equipoIds],
    );
  },

  obtenerInscripcion(id: number, db?: Queryable) {
    return queryOne<InscripcionFila>('SELECT * FROM inscripcion_jugador WHERE id = $1', [id], db);
  },

  inscripcionesDePartido(partidoId: number) {
    return query<InscripcionFila>('SELECT * FROM inscripcion_jugador WHERE partido_abierto_id = $1 ORDER BY fecha', [partidoId]);
  },

  async cambiarEstadoInscripcion(id: number, estado: InscripcionFila['estado'], db: Queryable): Promise<void> {
    await query('UPDATE inscripcion_jugador SET estado = $2 WHERE id = $1', [id, estado], db);
  },

  async eliminarInscripcion(id: number, db: Queryable): Promise<void> {
    await query('DELETE FROM inscripcion_jugador WHERE id = $1', [id], db);
  },

  rechazarInscripcionesPendientes(partidoId: number, db: Queryable) {
    return query<{ usuario_id: number }>(
      "UPDATE inscripcion_jugador SET estado = 'rechazada' WHERE partido_abierto_id = $1 AND estado = 'pendiente' RETURNING usuario_id",
      [partidoId],
      db,
    );
  },
};
