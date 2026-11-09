import { query, queryOne, type Queryable } from '../../shared/database/pool';
import { normalizarHora, separarTimestampLocal, timestampLocal } from '../../shared/utils/time';
import type {
  BloqueoDto,
  CanchaBusquedaDto,
  CanchaDto,
  CanchaInput,
  ComplejoDto,
  ComplejoInput,
  ComplejoResumenDto,
  EstadoComplejo,
  FiltrosComplejos,
  FotoDto,
  HorarioDto,
  HorarioEspecialInput,
  ServicioDto,
  TarifaDto,
  TarifaInput,
} from './venues.dto';

/** Único lugar con SQL del módulo venues. Siempre consultas parametrizadas. */

interface ComplejoFila {
  id: number;
  admin_id: number;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  ciudad: string;
  barrio: string;
  telefono: string;
  latitud: number | null;
  longitud: number | null;
  porcentaje_abono: number;
  estado: EstadoComplejo;
  motivo_rechazo: string | null;
  fecha_creacion: Date;
}

interface CanchaFila {
  id: number;
  complejo_id: number;
  nombre: string;
  tipo_futbol: number;
  superficie: string;
  techada: boolean;
  iluminacion: boolean;
  capacidad_jugadores: number;
  estado: 'activa' | 'inactiva';
}

const aCancha = (c: CanchaFila): CanchaDto => ({
  id: c.id,
  complejoId: c.complejo_id,
  nombre: c.nombre,
  tipoFutbol: c.tipo_futbol,
  superficie: c.superficie,
  techada: c.techada,
  iluminacion: c.iluminacion,
  capacidadJugadores: c.capacidad_jugadores,
  estado: c.estado,
});

const SELECT_HORARIO = `SELECT id, dia_semana AS "diaSemana", fecha_especial AS "fechaEspecial", cerrado, hora_apertura AS "horaApertura",
                               hora_cierre AS "horaCierre", duracion_turno_min AS "duracionTurnoMin"
                          FROM horario_atencion`;
const aHorario = (h: HorarioDto): HorarioDto => ({
  ...h,
  horaApertura: h.horaApertura === null ? null : normalizarHora(h.horaApertura),
  horaCierre: h.horaCierre === null ? null : normalizarHora(h.horaCierre),
});

const SELECT_TARIFA = `SELECT id, cancha_id AS "canchaId", tipo_dia AS "tipoDia", hora_inicio AS "horaInicio", hora_fin AS "horaFin",
                              precio, activa FROM tarifa`;
const aTarifa = (t: TarifaDto): TarifaDto => ({ ...t, horaInicio: normalizarHora(t.horaInicio), horaFin: normalizarHora(t.horaFin) });

interface BloqueoFila {
  id: number;
  cancha_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string;
}
const aIsoLocal = (ts: string) => {
  const { fecha, hora } = separarTimestampLocal(ts);
  return `${fecha}T${hora}`;
};
const aBloqueo = (b: BloqueoFila): BloqueoDto => ({
  id: b.id,
  canchaId: b.cancha_id,
  fechaInicio: aIsoLocal(b.fecha_inicio),
  fechaFin: aIsoLocal(b.fecha_fin),
  motivo: b.motivo,
});

/** Máximo de canchas que revisa una búsqueda de disponibilidad (RNF-04). */
const MAX_CANCHAS_BUSQUEDA = 1000;

export const venuesRepository = {
  // --- Servicios y complejos ------------------------------------------------------------------

  listarServicios() {
    return query<ServicioDto>('SELECT id, nombre FROM servicio ORDER BY id');
  },

  async serviciosExisten(ids: number[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const fila = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM servicio WHERE id = ANY($1::int[])', [ids]);
    return fila?.n === new Set(ids).size;
  },

  async crearComplejo(adminId: number, d: ComplejoInput, db: Queryable): Promise<number> {
    const fila = await queryOne<{ id: number }>(
      `INSERT INTO complejo (admin_id, nombre, descripcion, direccion, ciudad, barrio, telefono, latitud, longitud, porcentaje_abono)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [adminId, d.nombre, d.descripcion ?? null, d.direccion, d.ciudad, d.barrio, d.telefono, d.latitud ?? null, d.longitud ?? null, d.porcentajeAbono],
      db,
    );
    return fila!.id;
  },

  async actualizarComplejo(id: number, d: ComplejoInput, db: Queryable): Promise<void> {
    await query(
      `UPDATE complejo SET nombre = $2, descripcion = $3, direccion = $4, ciudad = $5, barrio = $6, telefono = $7,
              latitud = $8, longitud = $9, porcentaje_abono = $10
        WHERE id = $1`,
      [id, d.nombre, d.descripcion ?? null, d.direccion, d.ciudad, d.barrio, d.telefono, d.latitud ?? null, d.longitud ?? null, d.porcentajeAbono],
      db,
    );
  },

  async reemplazarServicios(complejoId: number, servicioIds: number[], db: Queryable): Promise<void> {
    await query('DELETE FROM complejo_servicio WHERE complejo_id = $1', [complejoId], db);
    if (servicioIds.length) {
      await query(
        'INSERT INTO complejo_servicio (complejo_id, servicio_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
        [complejoId, [...new Set(servicioIds)]],
        db,
      );
    }
  },

  async cambiarEstadoComplejo(id: number, estado: EstadoComplejo, motivo: string | null): Promise<void> {
    await query('UPDATE complejo SET estado = $2, motivo_rechazo = $3 WHERE id = $1', [id, estado, motivo]);
  },

  /** Resuelve la aprobación solo si el complejo sigue pendiente (evita dobles resoluciones simultáneas). */
  async resolverPendiente(id: number, estado: 'activo' | 'rechazado', motivo: string | null): Promise<boolean> {
    const filas = await query(
      "UPDATE complejo SET estado = $2, motivo_rechazo = $3 WHERE id = $1 AND estado = 'pendiente' RETURNING id",
      [id, estado, motivo],
    );
    return filas.length > 0;
  },

  /** Bloquea la fila del complejo (FOR UPDATE) dentro de una transacción. */
  async bloquearComplejo(id: number, db: Queryable): Promise<void> {
    await query('SELECT id FROM complejo WHERE id = $1 FOR UPDATE', [id], db);
  },

  /** `db`: dentro de una transacción, para no pedir una segunda conexión al pool. */
  async obtenerComplejo(id: number, db?: Queryable): Promise<ComplejoDto | undefined> {
    const c = await queryOne<ComplejoFila>('SELECT * FROM complejo WHERE id = $1', [id], db);
    if (!c) return undefined;
    // En secuencia: un cliente de transacción no admite consultas en paralelo.
    const servicios = await query<ServicioDto>(
      `SELECT s.id, s.nombre FROM complejo_servicio cs JOIN servicio s ON s.id = cs.servicio_id
        WHERE cs.complejo_id = $1 ORDER BY s.id`,
      [id],
      db,
    );
    const fotos = await query<FotoDto>('SELECT id, url, orden FROM foto_complejo WHERE complejo_id = $1 ORDER BY orden, id', [id], db);
    return {
      id: c.id,
      adminId: c.admin_id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      direccion: c.direccion,
      ciudad: c.ciudad,
      barrio: c.barrio,
      telefono: c.telefono,
      latitud: c.latitud,
      longitud: c.longitud,
      porcentajeAbono: c.porcentaje_abono,
      estado: c.estado,
      motivoRechazo: c.motivo_rechazo,
      fechaCreacion: c.fecha_creacion.toISOString(),
      servicios,
      fotos,
    };
  },

  /** Datos mínimos para autorizar (dueño y estado). */
  propietarioComplejo(id: number, db?: Queryable) {
    return queryOne<{ admin_id: number; estado: EstadoComplejo }>('SELECT admin_id, estado FROM complejo WHERE id = $1', [id], db);
  },

  /**
   * Resumen de complejos con filtros (HU-05: solo activos en búsquedas; HU-06: solo canchas activas).
   * `adminId` lista los del administrador sin importar su estado; `estado` filtra por estado.
   */
  async listarComplejos(
    f: Partial<FiltrosComplejos> & { adminId?: number; estado?: EstadoComplejo },
  ): Promise<{ complejos: ComplejoResumenDto[]; total: number }> {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (f.estado) condiciones.push(`c.estado = ${p(f.estado)}`);
    if (f.adminId !== undefined) condiciones.push(`c.admin_id = ${p(f.adminId)}`);
    if (f.ciudad) condiciones.push(`lower(c.ciudad) = lower(${p(f.ciudad)})`);
    if (f.q) {
      const patron = p(`%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
      condiciones.push(`(c.nombre ILIKE ${patron} OR c.barrio ILIKE ${patron})`);
    }
    if (f.tipoFutbol) {
      condiciones.push(`EXISTS (SELECT 1 FROM cancha k WHERE k.complejo_id = c.id AND k.estado = 'activa' AND k.tipo_futbol = ${p(f.tipoFutbol)})`);
    }
    if (f.servicio) {
      condiciones.push(`EXISTS (SELECT 1 FROM complejo_servicio s WHERE s.complejo_id = c.id AND s.servicio_id = ${p(f.servicio)})`);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const tamano = f.tamano ?? 50;
    const desplazamiento = ((f.pagina ?? 1) - 1) * tamano;

    const total = await queryOne<{ total: number }>(`SELECT count(*)::int AS total FROM complejo c ${where}`, params);
    const filas = await query<ComplejoResumenDto>(
      `SELECT c.id, c.nombre, c.direccion, c.ciudad, c.barrio, c.estado, c.motivo_rechazo AS "motivoRechazo", c.fecha_creacion AS "fechaCreacion",
              (SELECT f.url FROM foto_complejo f WHERE f.complejo_id = c.id ORDER BY f.orden, f.id LIMIT 1) AS "fotoPrincipal",
              COALESCE((SELECT array_agg(s.nombre ORDER BY s.id) FROM complejo_servicio cs JOIN servicio s ON s.id = cs.servicio_id
                         WHERE cs.complejo_id = c.id), '{}') AS servicios,
              COALESCE((SELECT array_agg(DISTINCT k.tipo_futbol ORDER BY k.tipo_futbol) FROM cancha k
                         WHERE k.complejo_id = c.id AND k.estado = 'activa'), '{}') AS "tiposFutbol",
              (SELECT count(*)::int FROM cancha k WHERE k.complejo_id = c.id AND k.estado = 'activa') AS "canchasActivas",
              (SELECT min(t.precio) FROM tarifa t JOIN cancha k ON k.id = t.cancha_id
                WHERE k.complejo_id = c.id AND k.estado = 'activa' AND t.activa) AS "precioDesde"
         FROM complejo c
         ${where}
        ORDER BY c.nombre, c.id
        LIMIT ${p(tamano)} OFFSET ${p(desplazamiento)}`,
      params,
    );
    return { complejos: filas, total: total?.total ?? 0 };
  },

  // --- Consultas en lote para la disponibilidad (HU-10, RNF-04) -------------------------------

  /** Canchas activas de complejos activos que cumplen los filtros, con los datos del complejo. */
  async canchasParaBusqueda(f: { ciudad?: string; barrio?: string; tipoFutbol?: number; complejoId?: number }): Promise<{ canchas: CanchaBusquedaDto[]; limitado: boolean }> {
    const condiciones = ["k.estado = 'activa'", "c.estado = 'activo'"];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (f.ciudad) condiciones.push(`lower(c.ciudad) = lower(${p(f.ciudad)})`);
    if (f.barrio) condiciones.push(`lower(c.barrio) = lower(${p(f.barrio)})`);
    if (f.tipoFutbol) condiciones.push(`k.tipo_futbol = ${p(f.tipoFutbol)}`);
    if (f.complejoId) condiciones.push(`c.id = ${p(f.complejoId)}`);
    const filas = await query<CanchaFila & { c_nombre: string; c_ciudad: string; c_barrio: string; c_direccion: string; latitud: number | null; longitud: number | null; porcentaje_abono: number; foto: string | null }>(
      `SELECT k.*, c.nombre AS c_nombre, c.ciudad AS c_ciudad, c.barrio AS c_barrio, c.direccion AS c_direccion,
              c.latitud, c.longitud, c.porcentaje_abono,
              (SELECT f.url FROM foto_complejo f WHERE f.complejo_id = c.id ORDER BY f.orden, f.id LIMIT 1) AS foto
         FROM cancha k JOIN complejo c ON c.id = k.complejo_id
        WHERE ${condiciones.join(' AND ')}
        ORDER BY c.nombre, k.nombre
        LIMIT ${MAX_CANCHAS_BUSQUEDA + 1}`,
      params,
    );
    const limitado = filas.length > MAX_CANCHAS_BUSQUEDA;
    const canchas = filas.slice(0, MAX_CANCHAS_BUSQUEDA).map((k) => ({
      ...aCancha(k),
      complejo: {
        id: k.complejo_id,
        nombre: k.c_nombre,
        ciudad: k.c_ciudad,
        barrio: k.c_barrio,
        direccion: k.c_direccion,
        latitud: k.latitud,
        longitud: k.longitud,
        porcentajeAbono: k.porcentaje_abono,
        fotoPrincipal: k.foto,
      },
    }));
    return { canchas, limitado };
  },

  async horariosDeComplejos(ids: number[]): Promise<(HorarioDto & { complejoId: number })[]> {
    if (!ids.length) return [];
    const filas = await query<HorarioDto & { complejoId: number }>(
      `SELECT id, complejo_id AS "complejoId", dia_semana AS "diaSemana", fecha_especial AS "fechaEspecial", cerrado,
              hora_apertura AS "horaApertura", hora_cierre AS "horaCierre", duracion_turno_min AS "duracionTurnoMin"
         FROM horario_atencion WHERE complejo_id = ANY($1::bigint[])`,
      [ids],
    );
    return filas.map((h) => ({ ...aHorario(h), complejoId: h.complejoId }));
  },

  async tarifasDeCanchas(ids: number[]): Promise<TarifaDto[]> {
    if (!ids.length) return [];
    const filas = await query<TarifaDto>(`${SELECT_TARIFA} WHERE cancha_id = ANY($1::bigint[]) AND activa`, [ids]);
    return filas.map(aTarifa);
  },

  async bloqueosDeCanchas(ids: number[], desde: string, hasta: string): Promise<BloqueoDto[]> {
    if (!ids.length) return [];
    const filas = await query<BloqueoFila>(
      `SELECT id, cancha_id, fecha_inicio, fecha_fin, motivo FROM bloqueo_horario
        WHERE cancha_id = ANY($1::bigint[]) AND tsrange(fecha_inicio, fecha_fin, '[)') && tsrange($2::timestamp, $3::timestamp, '[)')`,
      [ids, desde, hasta],
    );
    return filas.map(aBloqueo);
  },

  /** Hay algún bloqueo de la cancha que se cruce con el rango (hora local). */
  async hayBloqueoEnRango(canchaId: number, desde: string, hasta: string, db?: Queryable): Promise<boolean> {
    const fila = await queryOne<{ hay: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM bloqueo_horario
                       WHERE cancha_id = $1 AND tsrange(fecha_inicio, fecha_fin, '[)') && tsrange($2::timestamp, $3::timestamp, '[)')) AS hay`,
      [canchaId, desde, hasta],
      db,
    );
    return fila?.hay ?? false;
  },

  // --- Fotos ----------------------------------------------------------------------------------

  async contarFotos(complejoId: number, db?: Queryable): Promise<number> {
    const fila = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM foto_complejo WHERE complejo_id = $1', [complejoId], db);
    return fila?.n ?? 0;
  },

  async agregarFoto(complejoId: number, url: string, db?: Queryable): Promise<FotoDto> {
    const fila = await queryOne<FotoDto>(
      `INSERT INTO foto_complejo (complejo_id, url, orden)
       VALUES ($1, $2, (SELECT COALESCE(max(orden) + 1, 0) FROM foto_complejo WHERE complejo_id = $1))
       RETURNING id, url, orden`,
      [complejoId, url],
      db,
    );
    return fila!;
  },

  async eliminarFoto(complejoId: number, fotoId: number): Promise<boolean> {
    const filas = await query('DELETE FROM foto_complejo WHERE id = $1 AND complejo_id = $2 RETURNING id', [fotoId, complejoId]);
    return filas.length > 0;
  },

  // --- Canchas --------------------------------------------------------------------------------

  async crearCancha(complejoId: number, d: CanchaInput & { capacidadJugadores: number }): Promise<CanchaDto> {
    const fila = await queryOne<CanchaFila>(
      `INSERT INTO cancha (complejo_id, nombre, tipo_futbol, superficie, techada, iluminacion, capacidad_jugadores, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [complejoId, d.nombre, d.tipoFutbol, d.superficie, d.techada, d.iluminacion, d.capacidadJugadores, d.estado],
    );
    return aCancha(fila!);
  },

  async actualizarCancha(id: number, d: CanchaInput & { capacidadJugadores: number }): Promise<CanchaDto> {
    const fila = await queryOne<CanchaFila>(
      `UPDATE cancha SET nombre = $2, tipo_futbol = $3, superficie = $4, techada = $5, iluminacion = $6,
              capacidad_jugadores = $7, estado = $8
        WHERE id = $1 RETURNING *`,
      [id, d.nombre, d.tipoFutbol, d.superficie, d.techada, d.iluminacion, d.capacidadJugadores, d.estado],
    );
    return aCancha(fila!);
  },

  async obtenerCancha(id: number, db?: Queryable): Promise<(CanchaDto & { estadoComplejo: EstadoComplejo; adminId: number }) | undefined> {
    const fila = await queryOne<CanchaFila & { estado_complejo: EstadoComplejo; admin_id: number }>(
      `SELECT k.*, c.estado AS estado_complejo, c.admin_id
         FROM cancha k JOIN complejo c ON c.id = k.complejo_id
        WHERE k.id = $1`,
      [id],
      db,
    );
    return fila ? { ...aCancha(fila), estadoComplejo: fila.estado_complejo, adminId: fila.admin_id } : undefined;
  },

  /** Bloquea la fila de la cancha (FOR UPDATE) para serializar reservas y bloqueos sobre ella (HT-05). */
  async bloquearCancha(id: number, db: Queryable): Promise<void> {
    await query('SELECT id FROM cancha WHERE id = $1 FOR UPDATE', [id], db);
  },

  async listarCanchas(complejoId: number, soloActivas: boolean): Promise<CanchaDto[]> {
    const filas = await query<CanchaFila>(
      `SELECT * FROM cancha WHERE complejo_id = $1 ${soloActivas ? "AND estado = 'activa'" : ''} ORDER BY nombre, id`,
      [complejoId],
    );
    return filas.map(aCancha);
  },

  // --- Horarios -------------------------------------------------------------------------------

  async listarHorarios(complejoId: number, db?: Queryable): Promise<HorarioDto[]> {
    const filas = await query<HorarioDto>(
      `${SELECT_HORARIO} WHERE complejo_id = $1 ORDER BY fecha_especial NULLS FIRST, dia_semana`,
      [complejoId],
      db,
    );
    return filas.map(aHorario);
  },

  async reemplazarHorarioHabitual(
    complejoId: number,
    dias: { diaSemana: number; horaApertura: string; horaCierre: string; duracionTurnoMin: number }[],
    db: Queryable,
  ): Promise<void> {
    await query('DELETE FROM horario_atencion WHERE complejo_id = $1 AND dia_semana IS NOT NULL', [complejoId], db);
    for (const d of dias) {
      await query(
        `INSERT INTO horario_atencion (complejo_id, dia_semana, hora_apertura, hora_cierre, duracion_turno_min)
         VALUES ($1, $2, $3, $4, $5)`,
        [complejoId, d.diaSemana, d.horaApertura, d.horaCierre, d.duracionTurnoMin],
        db,
      );
    }
  },

  async guardarHorarioEspecial(complejoId: number, d: HorarioEspecialInput, db: Queryable): Promise<void> {
    const abierto = d.cerrado ? null : d;
    await query(
      `INSERT INTO horario_atencion (complejo_id, fecha_especial, cerrado, hora_apertura, hora_cierre, duracion_turno_min)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (complejo_id, fecha_especial) WHERE fecha_especial IS NOT NULL
       DO UPDATE SET cerrado = EXCLUDED.cerrado, hora_apertura = EXCLUDED.hora_apertura, hora_cierre = EXCLUDED.hora_cierre,
                     duracion_turno_min = EXCLUDED.duracion_turno_min`,
      [complejoId, d.fecha, d.cerrado, abierto?.horaApertura ?? null, abierto?.horaCierre ?? null, abierto?.duracionTurnoMin ?? null],
      db,
    );
  },

  async eliminarHorarioEspecial(complejoId: number, fecha: string): Promise<boolean> {
    const filas = await query('DELETE FROM horario_atencion WHERE complejo_id = $1 AND fecha_especial = $2 RETURNING id', [complejoId, fecha]);
    return filas.length > 0;
  },

  // --- Tarifas --------------------------------------------------------------------------------

  async listarTarifas(canchaId: number, soloActivas = true, db?: Queryable): Promise<TarifaDto[]> {
    const filas = await query<TarifaDto>(
      `${SELECT_TARIFA} WHERE cancha_id = $1 ${soloActivas ? 'AND activa' : ''} ORDER BY tipo_dia, hora_inicio`,
      [canchaId],
      db,
    );
    return filas.map(aTarifa);
  },

  async obtenerTarifa(id: number): Promise<TarifaDto | undefined> {
    const t = await queryOne<TarifaDto>(`${SELECT_TARIFA} WHERE id = $1`, [id]);
    return t ? aTarifa(t) : undefined;
  },

  async crearTarifa(canchaId: number, d: TarifaInput, db?: Queryable): Promise<TarifaDto> {
    const t = await queryOne<TarifaDto>(
      `INSERT INTO tarifa (cancha_id, tipo_dia, hora_inicio, hora_fin, precio) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, cancha_id AS "canchaId", tipo_dia AS "tipoDia", hora_inicio AS "horaInicio", hora_fin AS "horaFin", precio, activa`,
      [canchaId, d.tipoDia, d.horaInicio, d.horaFin, d.precio],
      db,
    );
    return aTarifa(t!);
  },

  /**
   * RN-04: una tarifa no se modifica en sitio; se desactiva y se crea otra. Las reservas guardan su
   * propio precio, así que no se ven afectadas en ningún caso.
   */
  async desactivarTarifa(id: number, db?: Queryable): Promise<void> {
    await query('UPDATE tarifa SET activa = FALSE WHERE id = $1', [id], db);
  },

  // --- Bloqueos -------------------------------------------------------------------------------

  async crearBloqueo(
    canchaId: number,
    creadoPor: number,
    inicio: { fecha: string; hora: string },
    fin: { fecha: string; hora: string },
    motivo: string,
    db: Queryable,
  ): Promise<BloqueoDto> {
    const fila = await queryOne<BloqueoFila>(
      `INSERT INTO bloqueo_horario (cancha_id, creado_por_id, fecha_inicio, fecha_fin, motivo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, cancha_id, fecha_inicio, fecha_fin, motivo`,
      [canchaId, creadoPor, timestampLocal(inicio.fecha, inicio.hora), timestampLocal(fin.fecha, fin.hora), motivo],
      db,
    );
    return aBloqueo(fila!);
  },

  /** Bloqueos de una cancha que se cruzan con [desde, hasta) en hora local. */
  async listarBloqueos(canchaId: number, desde: string, hasta: string, db?: Queryable): Promise<BloqueoDto[]> {
    const filas = await query<BloqueoFila>(
      `SELECT id, cancha_id, fecha_inicio, fecha_fin, motivo FROM bloqueo_horario
        WHERE cancha_id = $1 AND tsrange(fecha_inicio, fecha_fin, '[)') && tsrange($2::timestamp, $3::timestamp, '[)')
        ORDER BY fecha_inicio`,
      [canchaId, desde, hasta],
      db,
    );
    return filas.map(aBloqueo);
  },

  async obtenerBloqueo(id: number) {
    const fila = await queryOne<BloqueoFila>('SELECT id, cancha_id, fecha_inicio, fecha_fin, motivo FROM bloqueo_horario WHERE id = $1', [id]);
    return fila ? aBloqueo(fila) : undefined;
  },

  async eliminarBloqueo(id: number): Promise<void> {
    await query('DELETE FROM bloqueo_horario WHERE id = $1', [id]);
  },
};
