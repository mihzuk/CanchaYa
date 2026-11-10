import { eventBus } from '../../shared/events/eventBus';
import { formatearCOP } from '../../shared/utils/money';
import { fechaLegible } from '../../shared/utils/time';
import { directorioActual, notificationsService as s } from './notifications.service';

const partido = (id: number) => ({ referenciaTipo: 'partido', referenciaId: id });
const reserva = (id: number) => ({ referenciaTipo: 'reserva', referenciaId: id });
const equipo = (id: number) => ({ referenciaTipo: 'equipo', referenciaId: id });

async function nombreEquipo(id: number | null | undefined): Promise<string> {
  if (!id) return 'El equipo';
  return (await directorioActual().nombresEquipos([id])).get(id) ?? 'El equipo';
}

/** Escucha los eventos de los demás módulos y crea las notificaciones (HU-28, HU-29, HU-12.4, HU-18, HU-20, HU-24). */
export function registrarListeners(): void {
  // --- Reservas y pagos (HU-28) ----------------------------------------------------------------
  eventBus.on('PagoRegistrado', async ({ reservaId, usuarioId, confirmoReserva, comprobanteEnviado }) => {
    if (!usuarioId || !confirmoReserva) return;
    const r = await directorioActual().reserva(reservaId);
    // El pago en línea ya envió su comprobante por correo: no se duplica.
    await s.notificar(usuarioId, { tipo: 'reserva_confirmada', titulo: 'Reserva confirmada', mensaje: `Tu reserva ${r?.codigo ?? ''} en ${r?.complejo ?? 'el complejo'} para el ${fechaLegible(r?.fecha)} a las ${r?.hora ?? ''} está confirmada.`, ...reserva(reservaId), correo: !comprobanteEnviado });
  });
  eventBus.on('ReservaCancelada', async ({ reservaId, usuarioId, canceladaPorComplejo, motivo, valorReembolso }) => {
    if (!usuarioId || !canceladaPorComplejo) return;
    const r = await directorioActual().reserva(reservaId);
    const devolucion = valorReembolso > 0 ? ` Te devolveremos ${formatearCOP(valorReembolso)}.` : '';
    await s.notificar(usuarioId, { tipo: 'reserva_cancelada', titulo: 'El complejo canceló tu reserva', mensaje: `Tu reserva ${r?.codigo ?? ''} fue cancelada. Motivo: ${motivo ?? 'no indicado'}.${devolucion}`, ...reserva(reservaId), correo: true });
  });
  eventBus.on('ReservaReprogramada', async ({ reservaNuevaId, usuarioId, movidaPorComplejo, motivo }) => {
    if (!usuarioId || !movidaPorComplejo) return;
    const r = await directorioActual().reserva(reservaNuevaId);
    await s.notificar(usuarioId, { tipo: 'reserva_movida', titulo: 'El complejo movió tu reserva', mensaje: `Tu reserva ahora es el ${fechaLegible(r?.fecha)} a las ${r?.hora ?? ''}. Motivo: ${motivo ?? 'no indicado'}.`, ...reserva(reservaNuevaId), correo: true });
  });
  eventBus.on('ReservaExpirada', async ({ reservaId, usuarioId }) => {
    if (usuarioId) await s.notificar(usuarioId, { tipo: 'reserva_expirada', titulo: 'Tu reserva expiró', mensaje: 'No recibimos el pago a tiempo y la franja se liberó.', ...reserva(reservaId) });
  });
  eventBus.on('RecordatorioPartido', async ({ reservaId, usuarioId, complejo, hora }) => {
    await s.notificar(usuarioId, { tipo: 'recordatorio_partido', titulo: 'Tu partido es pronto', mensaje: `Te esperamos a las ${hora} en ${complejo}.`, ...reserva(reservaId), correo: true });
  });
  eventBus.on('ReembolsoResuelto', async ({ reservaId, usuarioId, valor }) => {
    if (usuarioId) await s.notificar(usuarioId, { tipo: 'reembolso_resuelto', titulo: 'Reembolso realizado', mensaje: `Te devolvimos ${formatearCOP(valor)}.`, ...reserva(reservaId), correo: true });
  });

  // --- Complejos ------------------------------------------------------------------------------
  eventBus.on('ComplejoAprobado', async ({ adminId, nombre, complejoId }) => {
    await s.notificar(adminId, { tipo: 'complejo_aprobado', titulo: 'Tu complejo fue aprobado', mensaje: `${nombre} ya aparece en las búsquedas.`, referenciaTipo: 'complejo', referenciaId: complejoId, correo: true });
  });
  eventBus.on('ComplejoRechazado', async ({ adminId, nombre, motivo, complejoId }) => {
    await s.notificar(adminId, { tipo: 'complejo_rechazado', titulo: 'Tu complejo fue rechazado', mensaje: `${nombre}: ${motivo}`, referenciaTipo: 'complejo', referenciaId: complejoId, correo: true });
  });

  // --- Equipos (HU-20, HU-21) ------------------------------------------------------------------
  eventBus.on('JugadorInvitado', async ({ equipoId, usuarioId }) => {
    await s.notificar(usuarioId, { tipo: 'invitacion_equipo', titulo: 'Te invitaron a un equipo', mensaje: `${await nombreEquipo(equipoId)} quiere que juegues con ellos.`, ...equipo(equipoId) });
  });
  eventBus.on('InvitacionRechazada', async ({ equipoId, capitanId }) => {
    await s.notificar(capitanId, { tipo: 'invitacion_rechazada', titulo: 'Invitación rechazada', mensaje: `Un jugador rechazó la invitación a ${await nombreEquipo(equipoId)}.`, ...equipo(equipoId) });
  });
  eventBus.on('CapitaniaPropuesta', async ({ equipoId, usuarioId }) => {
    await s.notificar(usuarioId, { tipo: 'capitania_propuesta', titulo: 'Te propusieron como capitán', mensaje: `Revisa la propuesta de ${await nombreEquipo(equipoId)}.`, ...equipo(equipoId) });
  });

  // --- Busca Partido (HU-12.4, HU-22.3, HU-24, HU-26, HU-29) ------------------------------------
  eventBus.on('PartidoPublicado', ({ partidoId, equipoId, ...datos }) => s.alertarPartidoPublicado(partidoId, equipoId, datos));
  eventBus.on('PostulacionRecibida', async ({ partidoId, equipoId, equipoPublicadorId }) => {
    await s.notificarCapitanes([equipoPublicadorId], { tipo: 'postulacion_recibida', titulo: 'Un equipo quiere jugar contra ustedes', mensaje: `${await nombreEquipo(equipoId)} se postuló a su partido. Acepta o rechaza la solicitud.`, ...partido(partidoId) });
  });
  eventBus.on('RivalConfirmado', async ({ partidoId, equipoPublicadorId, equipoRivalId, equipoDeudorId, equiposRechazados, horasParaPagar }) => {
    // HU-26: el aviso de pago va a quien debe pagar (en "sin cancha" es el publicador).
    const otro = equipoDeudorId === equipoPublicadorId ? equipoRivalId : equipoPublicadorId;
    await s.notificarCapitanes([otro], { tipo: 'rival_confirmado', titulo: 'Rival confirmado', mensaje: `${await nombreEquipo(equipoDeudorId)} jugará contra ustedes.`, ...partido(partidoId), correo: true });
    await s.notificarCapitanes([equipoDeudorId], { tipo: 'rival_confirmado', titulo: '¡Tienen partido!', mensaje: `Paguen su abono en las próximas ${horasParaPagar} horas para no perder el cupo.`, ...partido(partidoId), correo: true });
    if (equiposRechazados.length) await s.notificarCapitanes(equiposRechazados, { tipo: 'postulacion_rechazada', titulo: 'Solicitud no aceptada', mensaje: 'El partido ya tiene rival confirmado.', ...partido(partidoId) });
  });
  eventBus.on('PostulacionRechazada', async ({ partidoId, equipoId }) => {
    await s.notificarCapitanes([equipoId], { tipo: 'postulacion_rechazada', titulo: 'Solicitud no aceptada', mensaje: 'El equipo que publicó el partido rechazó su solicitud.', ...partido(partidoId) });
  });
  eventBus.on('InscripcionRecibida', async ({ partidoId, equipoPublicadorId }) => {
    await s.notificarCapitanes([equipoPublicadorId], { tipo: 'inscripcion_recibida', titulo: 'Un jugador pidió un cupo', mensaje: 'Acepta o rechaza la solicitud en tu partido.', ...partido(partidoId) });
  });
  eventBus.on('InscripcionResuelta', async ({ partidoId, usuarioId, aceptada }) => {
    await s.notificar(usuarioId, { tipo: 'inscripcion_resuelta', titulo: aceptada ? 'Tienes cupo en el partido' : 'No quedó cupo para ti', mensaje: aceptada ? 'El capitán aceptó tu solicitud.' : 'El capitán no aceptó tu solicitud o el partido se llenó.', ...partido(partidoId) });
  });
  eventBus.on('PartidoCancelado', async ({ partidoId, equipoPublicadorId, equipoRivalId, jugadores, equipoDuenoId, motivo }) => {
    // HU-12.4: avisa a quien no provocó la cancelación. El equipo de la reserva la canceló o ya recibió
    // el aviso del complejo (reserva cancelada o movida).
    const mensaje = motivo === 'reserva_cancelada' ? 'La reserva del partido se canceló. Si tu equipo pagó su parte, se le devolverá completa.' : 'El equipo que publicó el partido lo canceló.';
    const destinos = [equipoPublicadorId, equipoRivalId].filter((id) => id !== equipoDuenoId);
    await s.notificarCapitanes(destinos, { tipo: 'partido_cancelado', titulo: 'Partido cancelado', mensaje, ...partido(partidoId), correo: true });
    for (const usuarioId of jugadores) await s.notificar(usuarioId, { tipo: 'partido_cancelado', titulo: 'Partido cancelado', mensaje, ...partido(partidoId), correo: true });
  });
  eventBus.on('RivalRetirado', async ({ partidoId, equipoPublicadorId, equipoRivalId }) => {
    await s.notificarCapitanes([equipoPublicadorId], { tipo: 'rival_retirado', titulo: 'El rival se retiró', mensaje: `${await nombreEquipo(equipoRivalId)} ya no jugará. Tu partido vuelve a buscar rival.`, ...partido(partidoId), correo: true });
  });
  eventBus.on('RivalAnulado', async ({ partidoId, equipoPublicadorId, equipoRivalId, equipoDeudorId }) => {
    const otro = equipoDeudorId === equipoPublicadorId ? equipoRivalId : equipoPublicadorId;
    await s.notificarCapitanes([otro], { tipo: 'rival_anulado', titulo: 'El otro equipo no pagó a tiempo', mensaje: 'Su confirmación se anuló y el partido vuelve a buscar rival.', ...partido(partidoId), correo: true });
    await s.notificarCapitanes([equipoDeudorId], { tipo: 'rival_anulado', titulo: 'Perdieron la confirmación', mensaje: 'No pagaron su abono a tiempo. Si alcanzaron a pagar algo, se les devuelve completo.', ...partido(partidoId), correo: true });
  });
  eventBus.on('AlertaSinRival', async ({ partidoId, equipoPublicadorId }) => {
    await s.notificarCapitanes([equipoPublicadorId], { tipo: 'alerta_sin_rival', titulo: 'Tu partido sigue sin rival', mensaje: 'Faltan 6 horas. Decide si mantienes la publicación, la cancelas o juegan entre ustedes.', ...partido(partidoId), correo: true });
  });
  eventBus.on('EquipoSuspendido', async ({ equipoId, hasta }) => {
    await s.notificarCapitanes([equipoId], { tipo: 'equipo_suspendido', titulo: 'Equipo suspendido de Busca Partido', mensaje: `Por inasistencias, no podrán publicar ni postularse hasta el ${fechaLegible(hasta.slice(0, 10))}.`, ...equipo(equipoId), correo: true });
  });
  eventBus.on('SuspensionLevantada', async ({ equipoId }) => {
    await s.notificarCapitanes([equipoId], { tipo: 'suspension_levantada', titulo: 'Suspensión levantada', mensaje: 'Ya pueden volver a Busca Partido.', ...equipo(equipoId) });
  });

  // --- Reputación (HU-31) -----------------------------------------------------------------------
  eventBus.on('InasistenciaReportada', async ({ partidoId, adminId, equipoId }) => {
    await s.notificar(adminId, { tipo: 'inasistencia_reportada', titulo: 'Inasistencia por confirmar', mensaje: `Reportaron que ${await nombreEquipo(equipoId)} no se presentó. Confirma si fue así.`, ...partido(partidoId) });
  });
}
