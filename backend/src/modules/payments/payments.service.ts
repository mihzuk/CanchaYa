import { mailer } from '../../infrastructure/email/SmtpMailer';
import { correoComprobantePago } from '../../infrastructure/email/templates';
import { pasarelaDePagos } from '../../infrastructure/payments';
import { obtenerParametros } from '../../shared/config/parametros';
import { withTransaction, type Queryable } from '../../shared/database/pool';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../shared/events/eventBus';
import { auditar } from '../../shared/logger/audit';
import { logger } from '../../shared/logger/logger';
import type { UsuarioSesion } from '../../shared/middleware/authenticate';
import { formatearCOP } from '../../shared/utils/money';
import { instanteBogota } from '../../shared/utils/time';
import {
  bookingsApi,
  calcularTraslado,
  estaActiva,
  horasDeAnticipacion,
  puedeReprogramar,
  type ReservaDto,
  type ReservaExpiradaFila,
  type ReservaInterna,
} from '../bookings';
import { abonoFaltante, estadoTrasPago, validarMontoAbono } from './domain/deposit';
import { disponibleParaReembolso, porcentajeDeReembolso, reembolsosPorPago, repartirExcedente } from './domain/refund-policy';
import './payments.events';
import type { PagoDto, PagoEnLineaDto, PagoManualDto, PreviewCancelacionDto, ReembolsoDto, ReprogramacionDto } from './payments.dto';
import { paymentsRepository as repo, type PagoConReembolsos } from './payments.repository';

const NOMBRE_METODO: Record<string, string> = { tarjeta: 'Tarjeta', pse: 'PSE', nequi: 'Nequi', efectivo: 'Efectivo', transferencia: 'Transferencia' };

function noEncontrada(): AppError {
  return AppError.noEncontrado('RESERVA_NO_ENCONTRADA', 'La reserva no existe');
}

// --- Puerto hacia Busca Partido ------------------------------------------------------------------
// payments no puede importar matchmaking (matchmaking depende de payments).
type ConsultaPartido = (reservaId: number) => Promise<PreviewCancelacionDto['partidoAfectado']>;
let consultaPartido: ConsultaPartido = async () => null;
export function registrarConsultaPartidoDeReserva(fn: ConsultaPartido): void {
  consultaPartido = fn;
}

const complejoDelAdministrador = (complejoId: number, u: UsuarioSesion) => bookingsApi.asegurarAdminComplejo(complejoId, u);

/** El pago como lo ve el cliente (sin los totales internos de reembolso). */
function publico(p: PagoConReembolsos): PagoDto {
  const { reembolsado: _r, reembolsoPendiente: _p, liquidado: _l, ...dto } = p;
  return dto;
}

/** Porcentaje de RN-05 según la anticipación y quién cancela. */
async function calcularCancelacion(r: ReservaInterna, porComplejo: boolean, ahora: Date, db?: Queryable) {
  const parametros = await obtenerParametros(db);
  const horas = horasDeAnticipacion(instanteBogota(r.fecha, r.horaInicio), ahora);
  const porcentaje = porcentajeDeReembolso(horas, { pct24h: parametros.reembolsoPct24h, pct6h: parametros.reembolsoPct6h }, porComplejo);
  return { horas, porcentaje };
}

/**
 * Reembolsos que generaría una cancelación (sobre lo que aún no se ha devuelto). RN-05 aplica a lo que
 * pagó el dueño; lo que pagó el equipo rival vuelve siempre completo: la cancelación no fue decisión suya.
 */
/**
 * RN-05 sobre lo del dueño; 100 % a un equipo rival que sigue en el partido (no provocó la cancelación).
 * Lo que perdió un equipo al salir (HU-26.3) solo se devuelve si cancela el complejo.
 */
function reembolsosDeCancelacion(pagos: readonly PagoConReembolsos[], porcentaje: number, porComplejo: boolean) {
  const aDisponible = (p: PagoConReembolsos) => ({ id: p.id, disponible: disponibleParaReembolso(p) });
  const delEquipoActivo = pagos.filter((p) => p.equipoId !== null && (!p.liquidado || porComplejo));
  return [
    ...reembolsosPorPago(pagos.filter((p) => p.equipoId === null).map(aDisponible), porcentaje).map((r) => ({ ...r, porcentaje })),
    ...reembolsosPorPago(delEquipoActivo.map(aDisponible), 100).map((r) => ({ ...r, porcentaje: 100 })),
  ];
}

/** Pagos o reembolsos de un complejo con los datos que necesita el administrador (incluye el nombre del jugador). */
async function conDatosDeReserva<T extends { reservaId: number }>(complejoId: number, filas: T[]) {
  const reservas = await bookingsApi.deComplejo(complejoId, { ids: [...new Set(filas.map((f) => f.reservaId))] });
  const porId = new Map(reservas.map((r) => [r.id, r]));
  const nombres = await bookingsApi.nombresDeJugadores(reservas.map((r) => r.usuarioId));
  return filas.flatMap((f) => {
    const r = porId.get(f.reservaId);
    if (!r) return [];
    const cliente = r.nombreClienteManual ?? (r.usuarioId ? (nombres.get(r.usuarioId) ?? null) : null);
    return [{ ...f, reserva: { codigo: r.codigo, fecha: r.fecha, horaInicio: r.horaInicio, cancha: r.cancha.nombre, cliente } }];
  });
}

export const paymentsService = {
  /**
   * HU-16: pagar el abono en línea mientras la reserva está retenida (RN-02). Pago en dos fases (HT-08):
   * 1. Transacción corta: valida y registra el pago "pendiente" (un solo pago en curso por reserva).
   * 2. Cobro en la pasarela, fuera de toda transacción (no retiene conexiones ni bloqueos).
   * 3. Transacción corta: aplica el resultado. Aprobado → la reserva se confirma (o queda pagada).
   *    Si mientras tanto la reserva dejó de estar pendiente, el cobro aprobado se reembolsa completo.
   * Rechazado → la reserva sigue "Pendiente de pago" y se puede reintentar (402).
   */
  async pagarAbono(reservaId: number, usuario: UsuarioSesion, d: PagoEnLineaDto, ahora = new Date()): Promise<{ pago: PagoDto; reserva: ReservaDto }> {
    // Fase 1
    const inicio = await withTransaction(async (db) => {
      const r = await bookingsApi.obtener(reservaId, db, true);
      if (!r || r.usuarioId !== usuario.id) throw noEncontrada();
      if (r.estado !== 'pendiente_pago') throw AppError.conflicto('RESERVA_NO_PENDIENTE', 'Esta reserva ya no está pendiente de pago.');
      if (!r.fechaExpiracion || new Date(r.fechaExpiracion) <= ahora) {
        throw AppError.conflicto('RESERVA_EXPIRADA', 'El tiempo para pagar venció y la franja se liberó. Haz una nueva reserva.');
      }
      if (await repo.hayPagoEnCurso(r.id, db)) throw AppError.conflicto('PAGO_EN_CURSO', 'Ya hay un pago en proceso para esta reserva. Espera el resultado.');
      const valor = d.valor ?? abonoFaltante(r);
      const error = validarMontoAbono({ abonoRequerido: r.abonoRequerido, saldoPendiente: r.saldoPendiente, totalPagado: r.totalPagado, valor });
      if (error) throw AppError.validacion([{ campo: 'valor', mensaje: error }]);
      const pago = await repo.crearPago({ reservaId: r.id, usuarioId: usuario.id, valor, tipo: 'abono', metodo: d.metodo, referencia: null, estado: 'pendiente' }, db);
      return { pago, codigo: r.codigo };
    });

    // Fase 2: fuera de la transacción. La referencia interna es única por intento (idempotencia en la pasarela).
    let tx;
    try {
      tx = await pasarelaDePagos.cobrar({
        valor: inicio.pago.valor,
        metodo: d.metodo,
        referenciaInterna: `pago-${inicio.pago.id}`,
        descripcion: `Abono reserva ${inicio.codigo}`,
        datos: d.datos,
      });
    } catch (err) {
      logger.error('La pasarela de pagos falló', { pagoId: inicio.pago.id, error: (err as Error).message });
      await withTransaction((db) => repo.resolverPago(inicio.pago.id, 'rechazado', `ERROR-${inicio.pago.id}`, db));
      throw new AppError(502, 'PASARELA_NO_DISPONIBLE', 'No pudimos comunicarnos con la pasarela de pagos. Intenta de nuevo en unos minutos.');
    }
    const aprobado = tx.estado === 'aprobado';

    // Fase 3
    const fin = await withTransaction(async (db) => {
      const r = (await bookingsApi.obtener(reservaId, db, true))!;
      await repo.resolverPago(inicio.pago.id, aprobado ? 'aprobado' : 'rechazado', tx.referencia, db);
      let reembolsadoPorCierre = false;
      if (aprobado) {
        if (r.estado === 'pendiente_pago') {
          await bookingsApi.actualizarFinanzas(r.id, estadoTrasPago({ precioTotal: r.precioTotal, abonoRequerido: r.abonoRequerido, totalPagado: r.totalPagado + inicio.pago.valor }), db);
        } else {
          // La reserva venció o se canceló durante el cobro: se devuelve todo lo cobrado.
          await repo.crearReembolso({ pagoId: inicio.pago.id, valor: inicio.pago.valor, porcentaje: 100, motivo: `Pago recibido después de cerrar la reserva ${r.codigo}` }, db);
          reembolsadoPorCierre = true;
        }
      }
      return { pago: (await repo.obtenerPago(inicio.pago.id, db))!, reembolsadoPorCierre };
    });

    const pago = publico(fin.pago);
    auditar('pago.registrado', { usuarioId: usuario.id, entidad: 'pago', entidadId: pago.id, reservaId, estado: pago.estado, valor: pago.valor });
    if (!aprobado) {
      throw new AppError(402, 'PAGO_RECHAZADO', 'El pago fue rechazado. Tu reserva sigue apartada: puedes intentar de nuevo con otro medio.', undefined, { pago });
    }
    if (fin.reembolsadoPorCierre) {
      auditar('reembolso.creado', { usuarioId: usuario.id, entidad: 'pago', entidadId: pago.id, valor: pago.valor, motivo: 'reserva cerrada durante el cobro' });
      throw AppError.conflicto('RESERVA_EXPIRADA', 'El tiempo para pagar venció mientras se procesaba el pago. Te devolveremos el dinero; haz una nueva reserva.');
    }
    const reserva = (await bookingsApi.obtener(reservaId))!;
    await eventBus.emit('PagoRegistrado', { pagoId: pago.id, reservaId, usuarioId: usuario.id, valor: pago.valor, confirmoReserva: true, comprobanteEnviado: true });
    // HU-16.3: comprobante por correo (si el envío falla, el pago no se ve afectado).
    await mailer.enviar(
      correoComprobantePago(usuario.correo, usuario.nombres, {
        codigo: reserva.codigo,
        complejo: reserva.complejo.nombre,
        cancha: reserva.cancha.nombre,
        fecha: reserva.fecha,
        hora: `${reserva.horaInicio} - ${reserva.horaFin}`,
        valor: formatearCOP(pago.valor),
        metodo: NOMBRE_METODO[pago.metodo] ?? pago.metodo,
        referencia: pago.referencia ?? '',
        saldo: formatearCOP(reserva.saldoPendiente),
      }),
    );
    return { pago, reserva: bookingsApi.publica(reserva) };
  },

  /**
   * HU-17: el administrador registra un pago en efectivo o transferencia (por defecto, todo el saldo).
   * Recibir dinero en el complejo confirma la reserva: nunca queda "pendiente" con dinero adentro.
   */
  async registrarPagoManual(reservaId: number, usuario: UsuarioSesion, d: PagoManualDto): Promise<{ pago: PagoDto; reserva: ReservaDto }> {
    const res = await withTransaction(async (db) => {
      const r = await bookingsApi.obtener(reservaId, db, true);
      if (!r || !bookingsApi.puedeGestionar(r, usuario)) throw noEncontrada();
      if (r.estado !== 'pendiente_pago' && r.estado !== 'confirmada') {
        throw AppError.conflicto('ESTADO_INVALIDO', r.estado === 'pagada' ? 'La reserva ya está pagada.' : 'No se pueden registrar pagos en esta reserva.');
      }
      const valor = d.valor ?? (d.tipo === 'abono' ? Math.max(1, abonoFaltante(r)) : r.saldoPendiente);
      if (valor > r.saldoPendiente) throw AppError.validacion([{ campo: 'valor', mensaje: 'El valor supera el saldo pendiente de la reserva.' }]);
      const p = await repo.crearPago(
        { reservaId: r.id, usuarioId: r.usuarioId, valor, tipo: d.tipo, metodo: d.metodo, referencia: d.referencia ?? null, estado: 'aprobado' },
        db,
      );
      const nuevo = estadoTrasPago({ precioTotal: r.precioTotal, abonoRequerido: r.abonoRequerido, totalPagado: r.totalPagado + valor });
      if (nuevo.estado === 'pendiente_pago') nuevo.estado = 'confirmada';
      await bookingsApi.actualizarFinanzas(r.id, nuevo, db);
      return { p, confirmo: r.estado === 'pendiente_pago', usuarioReserva: r.usuarioId };
    });
    auditar('pago.registrado', { usuarioId: usuario.id, entidad: 'pago', entidadId: res.p.id, reservaId, metodo: d.metodo, valor: res.p.valor });
    await eventBus.emit('PagoRegistrado', { pagoId: res.p.id, reservaId, usuarioId: res.usuarioReserva, valor: res.p.valor, confirmoReserva: res.confirmo, comprobanteEnviado: false });
    return { pago: publico(res.p), reserva: bookingsApi.publica((await bookingsApi.obtener(reservaId))!) };
  },

  async pagosDeReserva(reservaId: number, usuario: UsuarioSesion) {
    const r = await bookingsApi.obtener(reservaId);
    if (!r || !bookingsApi.puedeVer(r, usuario)) throw noEncontrada();
    const [pagos, reembolsos] = await Promise.all([repo.pagosDeReservas([reservaId]), repo.reembolsosDeReservas([reservaId])]);
    return { pagos: pagos.map(publico), reembolsos, resumen: { precioTotal: r.precioTotal, totalPagado: r.totalPagado, saldoPendiente: r.saldoPendiente } };
  },

  /** HU-12: lo que se reembolsaría si se cancela ahora (para mostrarlo antes de confirmar). */
  async previewCancelacion(reservaId: number, usuario: UsuarioSesion, ahora = new Date()): Promise<PreviewCancelacionDto> {
    const r = await bookingsApi.obtener(reservaId);
    if (!r || !bookingsApi.puedeVer(r, usuario)) throw noEncontrada();
    const porComplejo = r.usuarioId !== usuario.id;
    const { horas, porcentaje } = await calcularCancelacion(r, porComplejo, ahora);
    const valorReembolso = reembolsosDeCancelacion(await repo.pagosAprobados(r.id), porcentaje, porComplejo).reduce((s, x) => s + x.valor, 0);
    return {
      horasDeAnticipacion: Math.round(horas * 10) / 10,
      porcentajeReembolso: porcentaje,
      totalPagado: r.totalPagado,
      valorReembolso,
      puedeReprogramar: r.usuarioId === usuario.id && (r.estado === 'confirmada' || r.estado === 'pagada') && puedeReprogramar(horas),
      partidoAfectado: await consultaPartido(r.id),
    };
  },

  /**
   * HU-12 criterios 1 y 2 (RN-05): cancelar genera reembolsos "pendientes" según la anticipación,
   * sobre lo que aún no se ha devuelto de cada pago. Si cancela el complejo (o el superadministrador),
   * se reembolsa el 100 % y el motivo es obligatorio (HU-28.3).
   */
  async cancelar(reservaId: number, usuario: UsuarioSesion, motivo: string | null | undefined, ahora = new Date()) {
    const res = await withTransaction(async (db) => {
      const r = await bookingsApi.obtener(reservaId, db, true);
      if (!r || !bookingsApi.puedeVer(r, usuario)) throw noEncontrada();
      const porComplejo = r.usuarioId !== usuario.id;
      if (porComplejo && !motivo) throw AppError.validacion([{ campo: 'motivo', mensaje: 'Indica el motivo de la cancelación para el cliente' }]);
      if (!estaActiva(r.estado)) throw AppError.conflicto('ESTADO_INVALIDO', 'Esta reserva ya no se puede cancelar.');
      if (instanteBogota(r.fecha, r.horaInicio) <= ahora) throw AppError.conflicto('PARTIDO_INICIADO', 'El partido ya empezó; no se puede cancelar.');

      const { porcentaje } = await calcularCancelacion(r, porComplejo, ahora, db);
      const reembolsos = reembolsosDeCancelacion(await repo.pagosAprobados(r.id, db), porcentaje, porComplejo);
      await bookingsApi.cancelar(r.id, motivo ?? (porComplejo ? null : 'Cancelada por el jugador'), db);
      for (const rb of reembolsos) {
        await repo.crearReembolso({ pagoId: rb.pagoId, valor: rb.valor, porcentaje: rb.porcentaje, motivo: `Cancelación de la reserva ${r.codigo}` }, db);
      }
      return { r, porComplejo, porcentaje, valorReembolso: reembolsos.reduce((s, x) => s + x.valor, 0) };
    });
    auditar('reserva.cancelada', { usuarioId: usuario.id, entidad: 'reserva', entidadId: reservaId, porComplejo: res.porComplejo, porcentajeReembolso: res.porcentaje });
    if (res.valorReembolso > 0) auditar('reembolso.creado', { usuarioId: usuario.id, entidad: 'reserva', entidadId: reservaId, valor: res.valorReembolso });
    await eventBus.emit('ReservaCancelada', {
      reservaId,
      usuarioId: res.r.usuarioId,
      canceladaPorComplejo: res.porComplejo,
      motivo: motivo ?? null,
      valorReembolso: res.valorReembolso,
    });
    return { reserva: bookingsApi.publica((await bookingsApi.obtener(reservaId))!), porcentajeReembolso: res.porcentaje, valorReembolso: res.valorReembolso };
  },

  /**
   * HU-12 criterio 3: con más de 24 h de anticipación, mover la reserva a otra franja libre del mismo
   * complejo trasladando lo pagado sin costo. Una sola transacción: si la nueva franja no está libre, la
   * reserva original queda intacta. Primero se bloquean las canchas (en orden de id) y luego la reserva,
   * el mismo orden que usa una reserva nueva, para no interbloquearse con ella.
   */
  async reprogramar(reservaId: number, usuario: UsuarioSesion, d: ReprogramacionDto, ahora = new Date()) {
    const expiradas: ReservaExpiradaFila[] = [];
    const res = await withTransaction(async (db) => {
      const previa = await bookingsApi.obtener(reservaId, db);
      // HU-28.3: el complejo también puede mover una reserva, indicando el motivo para el cliente.
      const porComplejo = !!previa && previa.usuarioId !== usuario.id;
      if (!previa || (porComplejo && !bookingsApi.puedeGestionar(previa, usuario))) throw noEncontrada();
      if (porComplejo && !d.motivo) throw AppError.validacion([{ campo: 'motivo', mensaje: 'Indica el motivo del cambio para el cliente' }]);
      const canchaId = d.canchaId ?? previa.canchaId;
      if (canchaId !== previa.canchaId && (await bookingsApi.complejoDeCancha(canchaId, db)) !== previa.complejo.id) {
        throw AppError.validacion([{ campo: 'canchaId', mensaje: 'La cancha debe ser del mismo complejo' }]);
      }
      await bookingsApi.bloquearCanchas([previa.canchaId, canchaId], db);
      const r = (await bookingsApi.obtener(reservaId, db, true))!;
      if (r.estado !== 'confirmada' && r.estado !== 'pagada') {
        throw AppError.conflicto('ESTADO_INVALIDO', 'Solo se puede reprogramar una reserva confirmada o pagada.');
      }
      if (porComplejo && instanteBogota(r.fecha, r.horaInicio) <= ahora) throw AppError.conflicto('PARTIDO_INICIADO', 'El partido ya empezó; no se puede mover.');
      if (!porComplejo && !puedeReprogramar(horasDeAnticipacion(instanteBogota(r.fecha, r.horaInicio), ahora))) {
        throw AppError.conflicto('FUERA_DE_PLAZO', 'Solo puedes reprogramar con más de 24 horas de anticipación. Puedes cancelar según la política de reembolso.');
      }
      // Primero se libera la franja original (puede solaparse con la nueva en la misma cancha).
      await bookingsApi.cancelar(r.id, 'Reprogramada', db);
      // Lo que pagó el equipo rival no se traslada: el partido se cierra y se le devuelve completo.
      const delRival = (await repo.pagosAprobados(r.id, db)).filter((p) => p.equipoId !== null && !p.liquidado);
      for (const p of delRival) {
        const disponible = disponibleParaReembolso(p);
        if (disponible > 0) await repo.crearReembolso({ pagoId: p.id, valor: disponible, porcentaje: 100, motivo: `Reprogramación de la reserva ${r.codigo}` }, db);
      }
      const pagadoDueno = r.totalPagado - delRival.reduce((s, p) => s + p.valor - p.reembolsado - p.reembolsoPendiente, 0);
      let excedente = 0;
      const nuevaId = await bookingsApi.reservarEnTransaccion(
        db,
        {
          canchaId,
          fecha: d.fecha,
          horaInicio: d.horaInicio,
          origen: r.origen,
          usuarioId: r.usuarioId,
          nombreCliente: r.nombreClienteManual,
          celularCliente: r.celularClienteManual,
          reprogramadaDeId: r.id,
          expiradas,
          valores: (precio, porcentajeAbono) => {
            // Si el cambio lo decide el complejo, al cliente nunca se le cobra más.
            const nuevoPrecio = porComplejo ? Math.min(precio, r.precioTotal) : precio;
            const t = calcularTraslado({ pagado: pagadoDueno, nuevoPrecio, porcentajeAbono });
            excedente = t.excedente;
            return t;
          },
        },
        ahora,
      );
      await repo.moverPagosAprobados(r.id, nuevaId, db);
      // Franja más barata: la diferencia se reembolsa repartida entre los pagos, del más reciente al más antiguo.
      let reembolsado = 0;
      if (excedente > 0) {
        const pagos = [...(await repo.pagosAprobados(nuevaId, db))].reverse();
        const reparto = repartirExcedente(pagos.map((p) => ({ id: p.id, disponible: disponibleParaReembolso(p) })), excedente);
        for (const rb of reparto.reembolsos) {
          const pago = pagos.find((p) => p.id === rb.pagoId)!;
          await repo.crearReembolso(
            { pagoId: rb.pagoId, valor: rb.valor, porcentaje: Math.round((rb.valor / pago.valor) * 10000) / 100, motivo: `Diferencia al reprogramar ${r.codigo}` },
            db,
          );
        }
        reembolsado = reparto.cubierto;
      }
      return { nuevaId, reembolsado, porComplejo, usuarioId: r.usuarioId };
    });
    await bookingsApi.emitirExpiradas(expiradas);
    auditar('reserva.reprogramada', { usuarioId: usuario.id, entidad: 'reserva', entidadId: reservaId, nuevaReservaId: res.nuevaId });
    if (res.reembolsado > 0) auditar('reembolso.creado', { usuarioId: usuario.id, entidad: 'reserva', entidadId: res.nuevaId, valor: res.reembolsado });
    await eventBus.emit('ReservaReprogramada', { reservaAnteriorId: reservaId, reservaNuevaId: res.nuevaId, usuarioId: res.usuarioId, movidaPorComplejo: res.porComplejo, motivo: d.motivo ?? null });
    return { reserva: bookingsApi.publica((await bookingsApi.obtener(res.nuevaId))!), excedenteReembolsado: res.reembolsado };
  },

  /** HU-18 criterio 1: reembolsos del complejo con valor, motivo, estado y a quién se devuelve. */
  async reembolsosDeComplejo(complejoId: number, usuario: UsuarioSesion, estado?: 'pendiente' | 'reembolsado') {
    await complejoDelAdministrador(complejoId, usuario);
    const ids = await bookingsApi.idsDeComplejo(complejoId);
    return conDatosDeReserva(complejoId, await repo.reembolsosDeReservas(ids, estado));
  },

  /** HU-18 criterio 2: marcar "Reembolsado" (la pasarela devuelve el dinero de los pagos en línea). */
  async resolverReembolso(reembolsoId: number, usuario: UsuarioSesion): Promise<ReembolsoDto> {
    const datos = await withTransaction(async (db) => {
      const rb = await repo.obtenerReembolso(reembolsoId, db, true);
      if (!rb) throw AppError.noEncontrado('REEMBOLSO_NO_ENCONTRADO', 'El reembolso no existe');
      const r = await bookingsApi.obtener(rb.reservaId, db);
      if (!r || !bookingsApi.puedeGestionar(r, usuario)) throw AppError.noEncontrado('REEMBOLSO_NO_ENCONTRADO', 'El reembolso no existe');
      if (rb.estado === 'reembolsado') throw AppError.conflicto('REEMBOLSO_YA_RESUELTO', 'Este reembolso ya fue marcado como reembolsado.');
      const enLinea = rb.metodo === 'tarjeta' || rb.metodo === 'pse' || rb.metodo === 'nequi';
      if (enLinea && rb.referenciaPago) {
        const tx = await pasarelaDePagos.reembolsar(rb.referenciaPago, rb.valor);
        if (tx.estado !== 'aprobado') throw new AppError(502, 'PASARELA_RECHAZO', 'La pasarela no pudo procesar el reembolso. Intenta de nuevo más tarde.');
      }
      await repo.marcarReembolsado(rb.id, db);
      await repo.actualizarEstadoPagoTrasReembolso(rb.pagoId, db);
      return { rb, usuarioReserva: r.usuarioId };
    });
    auditar('reembolso.resuelto', { usuarioId: usuario.id, entidad: 'reembolso', entidadId: reembolsoId, valor: datos.rb.valor });
    await eventBus.emit('ReembolsoResuelto', { reembolsoId, reservaId: datos.rb.reservaId, usuarioId: datos.usuarioReserva, valor: datos.rb.valor });
    const { metodo: _m, referenciaPago: _r, valorPago: _v, ...dto } = (await repo.obtenerReembolso(reembolsoId))!;
    return dto;
  },

  /**
   * HU-26: un equipo paga su parte de la reserva. Mismo pago en dos fases que el abono (HT-08).
   * Si la parte supera el saldo (el dueño ya había pagado de más), el excedente se le reembolsa al dueño.
   */
  async pagarParteEquipo(d: {
    reservaId: number;
    usuario: UsuarioSesion;
    equipoId: number;
    valor: number;
    metodo: PagoEnLineaDto['metodo'];
    datos?: PagoEnLineaDto['datos'];
    /** Parte y abono del equipo: se validan bajo el bloqueo de la reserva para que un doble envío no pague de más. */
    limites?: { parte: number; abono: number };
  }): Promise<PagoDto> {
    const inicio = await withTransaction(async (db) => {
      const r = await bookingsApi.obtener(d.reservaId, db, true);
      if (!r) throw noEncontrada();
      if (r.estado !== 'confirmada' && r.estado !== 'pagada') throw AppError.conflicto('ESTADO_INVALIDO', 'La reserva de este partido ya no admite pagos.');
      if (await repo.hayPagoEnCurso(r.id, db)) throw AppError.conflicto('PAGO_EN_CURSO', 'Ya hay un pago en proceso para esta reserva. Espera el resultado.');
      if (d.limites) {
        const pagado = await paymentsService.pagadoPorEquipo(r.id, d.equipoId, db);
        if (pagado >= d.limites.parte) throw AppError.conflicto('YA_PAGADO', 'Tu equipo ya pagó su parte.');
        if (pagado + d.valor < d.limites.abono) throw AppError.validacion([{ campo: 'valor', mensaje: `El abono mínimo es de ${d.limites.abono - pagado} pesos.` }]);
        if (pagado + d.valor > d.limites.parte) throw AppError.validacion([{ campo: 'valor', mensaje: 'El valor supera la parte de tu equipo.' }]);
      }
      const pago = await repo.crearPago({ reservaId: r.id, usuarioId: d.usuario.id, equipoId: d.equipoId, valor: d.valor, tipo: 'abono', metodo: d.metodo, referencia: null, estado: 'pendiente' }, db);
      return { pago, codigo: r.codigo };
    });
    let tx;
    try {
      tx = await pasarelaDePagos.cobrar({ valor: d.valor, metodo: d.metodo, referenciaInterna: `pago-${inicio.pago.id}`, descripcion: `Parte del equipo, reserva ${inicio.codigo}`, datos: d.datos });
    } catch (err) {
      logger.error('La pasarela de pagos falló', { pagoId: inicio.pago.id, error: (err as Error).message });
      await withTransaction((db) => repo.resolverPago(inicio.pago.id, 'rechazado', `ERROR-${inicio.pago.id}`, db));
      throw new AppError(502, 'PASARELA_NO_DISPONIBLE', 'No pudimos comunicarnos con la pasarela de pagos. Intenta de nuevo en unos minutos.');
    }
    const aprobado = tx.estado === 'aprobado';
    const pago = await withTransaction(async (db) => {
      const r = (await bookingsApi.obtener(d.reservaId, db, true))!;
      await repo.resolverPago(inicio.pago.id, aprobado ? 'aprobado' : 'rechazado', tx.referencia, db);
      if (aprobado) {
        if (r.estado !== 'confirmada' && r.estado !== 'pagada') {
          await repo.crearReembolso({ pagoId: inicio.pago.id, valor: d.valor, porcentaje: 100, motivo: `Pago recibido después de cerrar la reserva ${r.codigo}` }, db);
        } else {
          const excedente = Math.max(0, d.valor - r.saldoPendiente);
          if (excedente > 0) {
            const delDueno = [...(await repo.pagosAprobados(r.id, db))].filter((p) => p.equipoId === null).reverse();
            const reparto = repartirExcedente(delDueno.map((p) => ({ id: p.id, disponible: disponibleParaReembolso(p) })), excedente);
            for (const rb of reparto.reembolsos) {
              const original = delDueno.find((p) => p.id === rb.pagoId)!;
              await repo.crearReembolso({ pagoId: rb.pagoId, valor: rb.valor, porcentaje: Math.round((rb.valor / original.valor) * 10000) / 100, motivo: `Parte pagada por el equipo rival, reserva ${r.codigo}` }, db);
            }
          }
          const saldoPendiente = Math.max(0, r.saldoPendiente - d.valor);
          await bookingsApi.actualizarFinanzas(r.id, { saldoPendiente, estado: saldoPendiente === 0 ? 'pagada' : r.estado }, db);
        }
      }
      return publico((await repo.obtenerPago(inicio.pago.id, db))!);
    });
    auditar('pago.registrado', { usuarioId: d.usuario.id, entidad: 'pago', entidadId: pago.id, reservaId: d.reservaId, estado: pago.estado, valor: pago.valor, equipoId: d.equipoId });
    if (!aprobado) throw new AppError(402, 'PAGO_RECHAZADO', 'El pago fue rechazado. Puedes intentar de nuevo con otro medio.', undefined, { pago });
    return pago;
  },

  /** Lo que un equipo tiene pagado (y no devuelto) en una reserva (HU-17.2, HU-26). */
  async pagadoPorEquipo(reservaId: number, equipoId: number, db?: Queryable): Promise<number> {
    const pagos = await repo.pagosAprobados(reservaId, db);
    return pagos.filter((p) => p.equipoId === equipoId && !p.liquidado).reduce((s, p) => s + p.valor - p.reembolsado - p.reembolsoPendiente, 0);
  },

  /** Un cobro sigue en la pasarela: no se decide nada sobre el equipo hasta conocer su resultado. */
  hayPagoEnCurso: (reservaId: number, db: Queryable) => repo.hayPagoEnCurso(reservaId, db),

  /**
   * HU-26.3: el rival sale del partido. Recupera el porcentaje que corresponda y ese dinero vuelve a ser
   * saldo de la reserva; lo que pierde queda como pago de la reserva y ya no es del equipo.
   */
  async liquidarEquipo(reservaId: number, equipoId: number, porcentaje: number, motivo: string, enTx?: Queryable): Promise<number> {
    // Con `enTx` corre dentro de la transacción que libera al equipo: o pasan las dos cosas o ninguna.
    const liquidar = async (db: Queryable) => {
      const r = await bookingsApi.obtener(reservaId, db, true);
      if (!r) return 0;
      const pagos = (await repo.pagosAprobados(reservaId, db)).filter((p) => p.equipoId === equipoId && !p.liquidado);
      const reembolsos = reembolsosPorPago(pagos.map((p) => ({ id: p.id, disponible: disponibleParaReembolso(p) })), porcentaje);
      for (const rb of reembolsos) await repo.crearReembolso({ pagoId: rb.pagoId, valor: rb.valor, porcentaje, motivo }, db);
      await repo.marcarLiquidados(reservaId, equipoId, db);
      const total = reembolsos.reduce((s, x) => s + x.valor, 0);
      if (total > 0 && (r.estado === 'confirmada' || r.estado === 'pagada')) {
        await bookingsApi.actualizarFinanzas(r.id, { saldoPendiente: Math.min(r.precioTotal, r.saldoPendiente + total), estado: 'confirmada' }, db);
      }
      return total;
    };
    return enTx ? liquidar(enTx) : withTransaction(liquidar);
  },

  /** HU-17 criterio 2 / panel del complejo: pagos recibidos, con lo reembolsado de cada uno (M5). */
  async pagosDeComplejo(complejoId: number, usuario: UsuarioSesion, desde?: string, hasta?: string) {
    await complejoDelAdministrador(complejoId, usuario);
    const ids = await bookingsApi.idsDeComplejo(complejoId);
    return conDatosDeReserva(complejoId, await repo.pagosDeReservas(ids, { desde, hasta }));
  },
};
