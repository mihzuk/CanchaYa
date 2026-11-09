import { query, queryOne, type Queryable } from '../../shared/database/pool';
import { normalizarHora } from '../../shared/utils/time';
import { segundosRestantes } from './domain/expiration';
import type { EstadoReserva } from './domain/booking-rules';
import type { ReservaDto } from './bookings.dto';

/** Único lugar con SQL del módulo bookings. Siempre consultas parametrizadas. */

interface ReservaFila {
  id: number;
  codigo: string;
  usuario_id: number | null;
  cancha_id: number;
  cancha_nombre: string;
  tipo_futbol: number;
  complejo_id: number;
  complejo_nombre: string;
  direccion: string;
  ciudad: string;
  barrio: string;
  admin_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  precio_total: number;
  abono_requerido: number;
  saldo_pendiente: number;
  estado: EstadoReserva;
  origen: 'web' | 'manual';
  nombre_cliente_manual: string | null;
  celular_cliente_manual: string | null;
  reprogramada_de_id: number | null;
  motivo_cancelacion: string | null;
  fecha_creacion: Date;
  fecha_expiracion: Date | null;
  fecha_cancelacion: Date | null;
}

/** Reserva con datos internos para autorizar (dueño del complejo). */
export type ReservaInterna = ReservaDto & { adminId: number };

const SELECT_RESERVA = `
  SELECT r.id, r.codigo, r.usuario_id, r.cancha_id, k.nombre AS cancha_nombre, k.tipo_futbol,
         c.id AS complejo_id, c.nombre AS complejo_nombre, c.direccion, c.ciudad, c.barrio, c.admin_id,
         r.fecha, r.hora_inicio, r.hora_fin, r.precio_total, r.abono_requerido, r.saldo_pendiente, r.estado, r.origen,
         r.nombre_cliente_manual, r.celular_cliente_manual, r.reprogramada_de_id, r.motivo_cancelacion,
         r.fecha_creacion, r.fecha_expiracion, r.fecha_cancelacion
    FROM reserva r
    JOIN cancha k ON k.id = r.cancha_id
    JOIN complejo c ON c.id = k.complejo_id`;

function aDto(r: ReservaFila, ahora = new Date()): ReservaInterna {
  return {
    id: r.id,
    codigo: r.codigo,
    usuarioId: r.usuario_id,
    canchaId: r.cancha_id,
    cancha: { nombre: r.cancha_nombre, tipoFutbol: r.tipo_futbol },
    complejo: { id: r.complejo_id, nombre: r.complejo_nombre, direccion: r.direccion, ciudad: r.ciudad, barrio: r.barrio },
    fecha: r.fecha,
    horaInicio: normalizarHora(r.hora_inicio),
    horaFin: normalizarHora(r.hora_fin),
    precioTotal: r.precio_total,
    abonoRequerido: r.abono_requerido,
    saldoPendiente: r.saldo_pendiente,
    totalPagado: r.precio_total - r.saldo_pendiente,
    estado: r.estado,
    origen: r.origen,
    nombreClienteManual: r.nombre_cliente_manual,
    celularClienteManual: r.celular_cliente_manual,
    reprogramadaDeId: r.reprogramada_de_id,
    motivoCancelacion: r.motivo_cancelacion,
    fechaCreacion: r.fecha_creacion.toISOString(),
    fechaExpiracion: r.fecha_expiracion?.toISOString() ?? null,
    fechaCancelacion: r.fecha_cancelacion?.toISOString() ?? null,
    segundosParaPagar: r.estado === 'pendiente_pago' ? segundosRestantes(r.fecha_expiracion, ahora) : 0,
    adminId: r.admin_id,
  };
}

const ACTIVOS = "('pendiente_pago', 'confirmada', 'pagada')";

export interface ReservaExpiradaFila {
  id: number;
  codigo: string;
  usuarioId: number | null;
  canchaId: number;
  fecha: string;
  horaInicio: string;
}
const aExpirada = (r: { id: number; codigo: string; usuario_id: number | null; cancha_id: number; fecha: string; hora_inicio: string }): ReservaExpiradaFila => ({
  id: r.id,
  codigo: r.codigo,
  usuarioId: r.usuario_id,
  canchaId: r.cancha_id,
  fecha: r.fecha,
  horaInicio: normalizarHora(r.hora_inicio),
});

export const bookingsRepository = {
  async crear(
    d: {
      codigo: string;
      usuarioId: number | null;
      canchaId: number;
      fecha: string;
      horaInicio: string;
      horaFin: string;
      precioTotal: number;
      abonoRequerido: number;
      saldoPendiente: number;
      estado: EstadoReserva;
      origen: 'web' | 'manual';
      nombreCliente?: string | null;
      celularCliente?: string | null;
      fechaExpiracion: Date | null;
      reprogramadaDeId?: number | null;
    },
    db: Queryable,
  ): Promise<number> {
    const fila = await queryOne<{ id: number }>(
      `INSERT INTO reserva (codigo, usuario_id, cancha_id, fecha, hora_inicio, hora_fin, precio_total, abono_requerido,
                            saldo_pendiente, estado, origen, nombre_cliente_manual, celular_cliente_manual, fecha_expiracion,
                            reprogramada_de_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        d.codigo, d.usuarioId, d.canchaId, d.fecha, d.horaInicio, d.horaFin, d.precioTotal, d.abonoRequerido,
        d.saldoPendiente, d.estado, d.origen, d.nombreCliente ?? null, d.celularCliente ?? null, d.fechaExpiracion,
        d.reprogramadaDeId ?? null,
      ],
      db,
    );
    return fila!.id;
  },

  async obtener(id: number, db?: Queryable, paraActualizar = false): Promise<ReservaInterna | undefined> {
    const fila = await queryOne<ReservaFila>(`${SELECT_RESERVA} WHERE r.id = $1 ${paraActualizar ? 'FOR UPDATE OF r' : ''}`, [id], db);
    return fila ? aDto(fila) : undefined;
  },

  /** Serializa (dentro de la transacción) las reservas nuevas de un mismo usuario: el límite de pendientes no se puede saltar. */
  async bloquearUsuarioParaReservar(usuarioId: number, db: Queryable): Promise<void> {
    await query('SELECT pg_advisory_xact_lock(727001, $1::int)', [usuarioId], db);
  },

  async contarPendientesDeUsuario(usuarioId: number, db?: Queryable): Promise<number> {
    const fila = await queryOne<{ n: number }>(
      "SELECT count(*)::int AS n FROM reserva WHERE usuario_id = $1 AND estado = 'pendiente_pago' AND fecha_expiracion > now()",
      [usuarioId],
      db,
    );
    return fila?.n ?? 0;
  },

  /** HU-13: próximas (activas desde hoy) o historial (pasadas, canceladas, expiradas, cerradas). */
  async listarDeUsuario(usuarioId: number, vista: 'proximas' | 'historial', hoy: string, horaActual: string): Promise<ReservaInterna[]> {
    const proximas = `r.estado IN ${ACTIVOS} AND (r.fecha > $2 OR (r.fecha = $2 AND r.hora_fin > $3::time))`;
    const filas = await query<ReservaFila>(
      `${SELECT_RESERVA}
        WHERE r.usuario_id = $1 AND ${vista === 'proximas' ? proximas : `NOT (${proximas})`}
        ORDER BY r.fecha ${vista === 'proximas' ? 'ASC' : 'DESC'}, r.hora_inicio ${vista === 'proximas' ? 'ASC' : 'DESC'}
        LIMIT 200`,
      [usuarioId, hoy, horaActual],
    );
    return filas.map((f) => aDto(f));
  },

  /** HU-14: reservas de un complejo en un día (todas las canchas, todos los estados). */
  async listarDeComplejo(complejoId: number, fecha: string): Promise<ReservaInterna[]> {
    const filas = await query<ReservaFila>(
      `${SELECT_RESERVA} WHERE c.id = $1 AND r.fecha = $2 ORDER BY k.nombre, r.hora_inicio`,
      [complejoId, fecha],
    );
    return filas.map((f) => aDto(f));
  },

  /** Reservas de un complejo (cualquier estado) en un rango de fechas o por ids, para pagos y reportes. */
  async deComplejo(complejoId: number, f: { desde?: string; hasta?: string; ids?: number[] } = {}): Promise<ReservaInterna[]> {
    const condiciones = ['c.id = $1'];
    const params: unknown[] = [complejoId];
    if (f.desde) {
      params.push(f.desde);
      condiciones.push(`r.fecha >= $${params.length}`);
    }
    if (f.hasta) {
      params.push(f.hasta);
      condiciones.push(`r.fecha <= $${params.length}`);
    }
    if (f.ids) {
      params.push(f.ids);
      condiciones.push(`r.id = ANY($${params.length}::bigint[])`);
    }
    const filas = await query<ReservaFila>(
      `${SELECT_RESERVA} WHERE ${condiciones.join(' AND ')} ORDER BY r.fecha DESC, r.hora_inicio DESC LIMIT 5000`,
      params,
    );
    return filas.map((x) => aDto(x));
  },

  /** Reservas activas (RN-01) por cancha o complejo en un rango de fechas. */
  async activas(
    f: { canchaIds?: number[]; complejoId?: number; desdeFecha: string; hastaFecha?: string },
    db?: Queryable,
  ): Promise<{ id: number; codigo: string; canchaId: number; fecha: string; horaInicio: string; horaFin: string }[]> {
    // Una reserva sin pago ya vencida no ocupa la franja aunque la tarea programada aún no la haya expirado (RN-02).
    const condiciones = [`r.estado IN ${ACTIVOS}`, "NOT (r.estado = 'pendiente_pago' AND r.fecha_expiracion <= now())", 'r.fecha >= $1'];
    const params: unknown[] = [f.desdeFecha];
    if (f.hastaFecha) {
      params.push(f.hastaFecha);
      condiciones.push(`r.fecha <= $${params.length}`);
    }
    if (f.canchaIds) {
      params.push(f.canchaIds);
      condiciones.push(`r.cancha_id = ANY($${params.length}::bigint[])`);
    }
    if (f.complejoId) {
      params.push(f.complejoId);
      condiciones.push(`k.complejo_id = $${params.length}`);
    }
    const filas = await query<{ id: number; codigo: string; cancha_id: number; fecha: string; hora_inicio: string; hora_fin: string }>(
      `SELECT r.id, r.codigo, r.cancha_id, r.fecha, r.hora_inicio, r.hora_fin
         FROM reserva r JOIN cancha k ON k.id = r.cancha_id
        WHERE ${condiciones.join(' AND ')}
        ORDER BY r.fecha, r.hora_inicio`,
      params,
      db,
    );
    return filas.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      canchaId: r.cancha_id,
      fecha: r.fecha,
      horaInicio: normalizarHora(r.hora_inicio),
      horaFin: normalizarHora(r.hora_fin),
    }));
  },

  async actualizarFinanzas(
    id: number,
    d: { saldoPendiente: number; estado: EstadoReserva; abonoRequerido?: number },
    db: Queryable,
  ): Promise<void> {
    await query(
      `UPDATE reserva
          SET saldo_pendiente = $2, estado = $3::varchar, abono_requerido = COALESCE($4::numeric, abono_requerido),
              fecha_expiracion = CASE WHEN $3::varchar = 'pendiente_pago' THEN fecha_expiracion ELSE NULL END
        WHERE id = $1`,
      [id, d.saldoPendiente, d.estado, d.abonoRequerido ?? null],
      db,
    );
  },

  async cancelar(id: number, motivo: string | null, db: Queryable): Promise<void> {
    await query(
      `UPDATE reserva SET estado = 'cancelada', motivo_cancelacion = $2, fecha_cancelacion = now(), fecha_expiracion = NULL
        WHERE id = $1`,
      [id, motivo],
      db,
    );
  },

  async cambiarEstado(id: number, estado: EstadoReserva, db?: Queryable): Promise<void> {
    await query('UPDATE reserva SET estado = $2 WHERE id = $1', [id, estado], db);
  },

  /** RN-02 dentro de la transacción de una reserva nueva: libera primero las retenciones vencidas de la cancha. */
  async expirarVencidasDeCancha(canchaId: number, ahora: Date, db: Queryable): Promise<ReservaExpiradaFila[]> {
    const filas = await query<{ id: number; codigo: string; usuario_id: number | null; cancha_id: number; fecha: string; hora_inicio: string }>(
      `UPDATE reserva SET estado = 'expirada'
        WHERE cancha_id = $1 AND estado = 'pendiente_pago' AND fecha_expiracion <= $2 AND saldo_pendiente = precio_total
        RETURNING id, codigo, usuario_id, cancha_id, fecha, hora_inicio`,
      [canchaId, ahora],
      db,
    );
    return filas.map(aExpirada);
  },

  /**
   * RN-02: pasa a "expirada" las reservas sin pago vencidas y devuelve cuáles. Idempotente:
   * dos ejecuciones simultáneas no expiran dos veces la misma (SKIP LOCKED).
   */
  async expirarVencidas(ahora: Date): Promise<ReservaExpiradaFila[]> {
    const filas = await query<{ id: number; codigo: string; usuario_id: number | null; cancha_id: number; fecha: string; hora_inicio: string }>(
      `UPDATE reserva SET estado = 'expirada'
        WHERE id IN (SELECT id FROM reserva
                      WHERE estado = 'pendiente_pago' AND fecha_expiracion <= $1
                        -- Invariante: una reserva con algo pagado nunca expira (no se queda con el dinero).
                        AND saldo_pendiente = precio_total
                      FOR UPDATE SKIP LOCKED)
        RETURNING id, codigo, usuario_id, cancha_id, fecha, hora_inicio`,
      [ahora],
    );
    return filas.map(aExpirada);
  },

  /** Ids de todas las reservas de un complejo (sin tope), para filtrar pagos y reembolsos. */
  async idsDeComplejo(complejoId: number): Promise<number[]> {
    const filas = await query<{ id: number }>(
      'SELECT r.id FROM reserva r JOIN cancha k ON k.id = r.cancha_id WHERE k.complejo_id = $1',
      [complejoId],
    );
    return filas.map((f) => f.id);
  },
};
