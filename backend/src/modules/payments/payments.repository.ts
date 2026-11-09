import { query, queryOne, type Queryable } from '../../shared/database/pool';
import type { EstadoPago, MetodoPago, PagoDto, ReembolsoDto, TipoPago } from './payments.dto';

/** Único lugar con SQL del módulo payments. Siempre consultas parametrizadas. */

/** Pago con lo reembolsado: `reembolsado` (ya devuelto) y `reembolsoPendiente` (por devolver). */
export type PagoConReembolsos = PagoDto & { reembolsado: number; reembolsoPendiente: number };

const SELECT_PAGO = `
  SELECT p.id, p.reserva_id AS "reservaId", p.usuario_id AS "usuarioId", p.equipo_id AS "equipoId", p.valor, p.tipo, p.metodo,
         p.referencia, p.estado, p.fecha,
         COALESCE((SELECT sum(rb.valor) FROM reembolso rb WHERE rb.pago_id = p.id AND rb.estado = 'reembolsado'), 0) AS reembolsado,
         COALESCE((SELECT sum(rb.valor) FROM reembolso rb WHERE rb.pago_id = p.id AND rb.estado = 'pendiente'), 0) AS "reembolsoPendiente"
    FROM pago p`;
type PagoFila = Omit<PagoConReembolsos, 'fecha'> & { fecha: Date };
const aPago = (p: PagoFila): PagoConReembolsos => ({ ...p, fecha: p.fecha.toISOString() });

const SELECT_REEMBOLSO = `SELECT rb.id, rb.pago_id AS "pagoId", p.reserva_id AS "reservaId", rb.valor, rb.porcentaje, rb.motivo, rb.estado,
                                 rb.fecha_solicitud AS "fechaSolicitud", rb.fecha_resolucion AS "fechaResolucion"
                            FROM reembolso rb JOIN pago p ON p.id = rb.pago_id`;
type ReembolsoFila = Omit<ReembolsoDto, 'fechaSolicitud' | 'fechaResolucion'> & { fechaSolicitud: Date; fechaResolucion: Date | null };
const aReembolso = (r: ReembolsoFila): ReembolsoDto => ({
  ...r,
  fechaSolicitud: r.fechaSolicitud.toISOString(),
  fechaResolucion: r.fechaResolucion?.toISOString() ?? null,
});

/** Un pago en línea "pendiente" más antiguo que esto se considera abandonado (no bloquea reintentos). */
const MINUTOS_PAGO_EN_CURSO = 5;

export const paymentsRepository = {
  async crearPago(
    d: { reservaId: number; usuarioId: number | null; valor: number; tipo: TipoPago; metodo: MetodoPago; referencia: string | null; estado: EstadoPago },
    db: Queryable,
  ): Promise<PagoConReembolsos> {
    const fila = await queryOne<{ id: number }>(
      `INSERT INTO pago (reserva_id, usuario_id, valor, tipo, metodo, referencia, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [d.reservaId, d.usuarioId, d.valor, d.tipo, d.metodo, d.referencia, d.estado],
      db,
    );
    return (await this.obtenerPago(fila!.id, db))!;
  },

  async obtenerPago(id: number, db?: Queryable, paraActualizar = false): Promise<PagoConReembolsos | undefined> {
    const fila = await queryOne<PagoFila>(`${SELECT_PAGO} WHERE p.id = $1 ${paraActualizar ? 'FOR UPDATE OF p' : ''}`, [id], db);
    return fila ? aPago(fila) : undefined;
  },

  /** HT-08: resultado de la pasarela sobre un pago que estaba "pendiente". */
  async resolverPago(id: number, estado: 'aprobado' | 'rechazado', referencia: string, db: Queryable): Promise<void> {
    await query("UPDATE pago SET estado = $2, referencia = $3 WHERE id = $1 AND estado = 'pendiente'", [id, estado, referencia], db);
  },

  /** Hay un pago en línea en curso (evita cobrar dos veces el mismo abono). */
  async hayPagoEnCurso(reservaId: number, db: Queryable): Promise<boolean> {
    const fila = await queryOne<{ hay: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pago WHERE reserva_id = $1 AND estado = 'pendiente'
                         AND fecha > now() - make_interval(mins => $2)) AS hay`,
      [reservaId, MINUTOS_PAGO_EN_CURSO],
      db,
    );
    return fila?.hay ?? false;
  },

  async pagosDeReservas(reservaIds: number[], f: { desde?: string; hasta?: string; limite?: number } = {}): Promise<PagoConReembolsos[]> {
    if (!reservaIds.length) return [];
    const params: unknown[] = [reservaIds];
    const condiciones = ['p.reserva_id = ANY($1::bigint[])'];
    // Rango por fecha del pago en hora de Bogotá.
    if (f.desde) {
      params.push(f.desde);
      condiciones.push(`(p.fecha AT TIME ZONE 'America/Bogota')::date >= $${params.length}`);
    }
    if (f.hasta) {
      params.push(f.hasta);
      condiciones.push(`(p.fecha AT TIME ZONE 'America/Bogota')::date <= $${params.length}`);
    }
    params.push(f.limite ?? 2000);
    const filas = await query<PagoFila>(
      `${SELECT_PAGO} WHERE ${condiciones.join(' AND ')} ORDER BY p.fecha DESC, p.id DESC LIMIT $${params.length}`,
      params,
    );
    return filas.map(aPago);
  },

  /** Pagos aprobados de una reserva con lo ya reembolsado (o por reembolsar) de cada uno. */
  async pagosAprobados(reservaId: number, db?: Queryable): Promise<PagoConReembolsos[]> {
    const filas = await query<PagoFila>(`${SELECT_PAGO} WHERE p.reserva_id = $1 AND p.estado = 'aprobado' ORDER BY p.fecha, p.id`, [reservaId], db);
    return filas.map(aPago);
  },

  /** HU-12.3: lo pagado se traslada a la nueva reserva. */
  async moverPagosAprobados(desdeReservaId: number, haciaReservaId: number, db: Queryable): Promise<void> {
    await query("UPDATE pago SET reserva_id = $2 WHERE reserva_id = $1 AND estado = 'aprobado'", [desdeReservaId, haciaReservaId], db);
  },

  /** Un pago puede tener varios reembolsos; su suma nunca supera el valor del pago (disparador de la BD). */
  async crearReembolso(d: { pagoId: number; valor: number; porcentaje: number; motivo: string }, db: Queryable): Promise<void> {
    await query('INSERT INTO reembolso (pago_id, valor, porcentaje, motivo) VALUES ($1, $2, $3, $4)', [d.pagoId, d.valor, d.porcentaje, d.motivo], db);
  },

  async reembolsosDeReservas(reservaIds: number[], estado?: 'pendiente' | 'reembolsado', limite = 2000): Promise<ReembolsoDto[]> {
    if (!reservaIds.length) return [];
    const params: unknown[] = [reservaIds];
    if (estado) params.push(estado);
    params.push(limite);
    const filas = await query<ReembolsoFila>(
      `${SELECT_REEMBOLSO} WHERE p.reserva_id = ANY($1::bigint[]) ${estado ? 'AND rb.estado = $2' : ''}
        ORDER BY rb.fecha_solicitud DESC LIMIT $${params.length}`,
      params,
    );
    return filas.map(aReembolso);
  },

  async obtenerReembolso(id: number, db?: Queryable, paraActualizar = false) {
    const fila = await queryOne<ReembolsoFila & { metodo: MetodoPago; referenciaPago: string | null; valorPago: number }>(
      `SELECT rb.id, rb.pago_id AS "pagoId", p.reserva_id AS "reservaId", rb.valor, rb.porcentaje, rb.motivo, rb.estado,
              rb.fecha_solicitud AS "fechaSolicitud", rb.fecha_resolucion AS "fechaResolucion",
              p.metodo, p.referencia AS "referenciaPago", p.valor AS "valorPago"
         FROM reembolso rb JOIN pago p ON p.id = rb.pago_id
        WHERE rb.id = $1 ${paraActualizar ? 'FOR UPDATE OF rb' : ''}`,
      [id],
      db,
    );
    return fila ? { ...aReembolso(fila), metodo: fila.metodo, referenciaPago: fila.referenciaPago, valorPago: fila.valorPago } : undefined;
  },

  async marcarReembolsado(id: number, db: Queryable): Promise<void> {
    await query("UPDATE reembolso SET estado = 'reembolsado', fecha_resolucion = now() WHERE id = $1", [id], db);
  },

  /** Si los reembolsos ya devueltos cubren todo el pago, el pago queda "reembolsado". */
  async actualizarEstadoPagoTrasReembolso(pagoId: number, db: Queryable): Promise<void> {
    await query(
      `UPDATE pago SET estado = 'reembolsado'
        WHERE id = $1 AND estado = 'aprobado'
          AND valor <= (SELECT COALESCE(sum(valor), 0) FROM reembolso WHERE pago_id = $1 AND estado = 'reembolsado')`,
      [pagoId],
      db,
    );
  },
};
