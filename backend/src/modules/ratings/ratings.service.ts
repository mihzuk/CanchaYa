import { esErrorPg, PG_ERRORES } from '../../shared/database/pool';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../shared/events/eventBus';
import type { UsuarioSesion } from '../../shared/middleware/authenticate';
import { bookingsApi } from '../bookings';
import { matchmakingApi } from '../matchmaking';
import { equipoCalificable, puedeCalificarComplejo } from './domain/rating-rules';
import type { CalificarEquipoDto } from './ratings.dto';
import { ratingsRepository as repo } from './ratings.repository';

const reservaNoExiste = () => AppError.noEncontrado('RESERVA_NO_ENCONTRADA', 'La reserva no existe');

export const ratingsService = {
  /** HU-30: 1 a 5 estrellas tras jugar; si ya calificó, edita su calificación. */
  async calificarComplejo(reservaId: number, usuario: UsuarioSesion, estrellas: number, comentario: string | null | undefined) {
    const r = await bookingsApi.obtener(reservaId);
    if (!r || r.usuarioId !== usuario.id) throw reservaNoExiste();
    if (!puedeCalificarComplejo(r.estado)) throw AppError.conflicto('RESERVA_NO_COMPLETADA', 'Solo puedes calificar una reserva completada.');
    return repo.guardarDeComplejo({ reservaId, usuarioId: usuario.id, complejoId: r.complejo.id, estrellas, comentario: comentario ?? null });
  },

  async miCalificacion(reservaId: number, usuario: UsuarioSesion) {
    const r = await bookingsApi.obtener(reservaId);
    if (!r || r.usuarioId !== usuario.id) throw reservaNoExiste();
    return (await repo.deReserva(reservaId)) ?? null;
  },

  async deComplejo(complejoId: number, pagina: number, tamano: number) {
    const calificaciones = await repo.deComplejo(complejoId, pagina, tamano);
    const resumen = (await repo.promediosDeComplejos([complejoId])).get(complejoId) ?? null;
    // Las reseñas se muestran sin identificar al autor.
    return { resumen, calificaciones: calificaciones.map(({ usuarioId: _u, reservaId: _r, ...c }) => c) };
  },

  /** HU-31: el capitán califica al rival o reporta que no se presentó. Una vez por equipo y partido (RN-12). */
  async calificarEquipo(partidoId: number, usuario: UsuarioSesion, d: CalificarEquipoDto) {
    const p = await matchmakingApi.obtenerPartido(partidoId);
    if (!p) throw AppError.noEncontrado('PARTIDO_NO_ENCONTRADO', 'El partido no existe');
    if (!(await matchmakingApi.capitanEs(d.equipoId, usuario.id))) throw AppError.prohibido('Solo el capitán del equipo puede calificar.');
    const calificadoId = equipoCalificable({ estado: p.estado, equipoPublicadorId: p.equipo_publicador_id, equipoRivalId: p.equipo_rival_id }, d.equipoId);
    if (calificadoId === null) throw AppError.conflicto('PARTIDO_NO_CALIFICABLE', 'Solo los equipos de un partido jugado pueden calificar.');
    let calificacion;
    try {
      calificacion = await repo.crearDeEquipo({
        partidoId,
        calificadorId: d.equipoId,
        calificadoId,
        puntualidad: d.noSePresento ? null : d.puntualidad,
        fairPlay: d.noSePresento ? null : d.fairPlay,
        noSePresento: d.noSePresento,
        comentario: d.comentario ?? null,
      });
    } catch (err) {
      if (esErrorPg(err, PG_ERRORES.UNIQUE, 'calificacion_equipo_uk')) throw AppError.conflicto('YA_CALIFICADO', 'Tu equipo ya calificó este partido.');
      throw err;
    }
    if (d.noSePresento && p.reserva_id) {
      const r = await bookingsApi.obtener(p.reserva_id);
      if (r) await eventBus.emit('InasistenciaReportada', { partidoId, adminId: r.adminId, equipoId: calificadoId });
    }
    return calificacion;
  },

  /** Lo que calificó el equipo que capitanea este usuario en el partido; `null` si aún no lo hizo o no participó. */
  async miCalificacionDePartido(partidoId: number, usuario: UsuarioSesion) {
    const p = await matchmakingApi.obtenerPartido(partidoId);
    if (!p) throw AppError.noEncontrado('PARTIDO_NO_ENCONTRADO', 'El partido no existe');
    for (const equipoId of [p.equipo_publicador_id, p.equipo_rival_id]) {
      if (equipoId !== null && (await matchmakingApi.capitanEs(equipoId, usuario.id))) return (await repo.deEquipoEnPartido(partidoId, equipoId)) ?? null;
    }
    return null;
  },

  /** HU-31.2: el administrador del complejo ve lo que debe confirmar. */
  async inasistenciasPorConfirmar(complejoId: number, usuario: UsuarioSesion) {
    await bookingsApi.asegurarAdminComplejo(complejoId, usuario);
    return repo.inasistenciasPorConfirmar(await matchmakingApi.idsPorReservas(await bookingsApi.idsDeComplejo(complejoId)));
  },

  /** HU-31.2: al confirmar, el equipo recibe la marca de inasistencia (RN-08 puede suspenderlo). */
  async confirmarInasistencia(calificacionId: number, usuario: UsuarioSesion) {
    const c = await repo.obtenerDeEquipo(calificacionId);
    if (!c || !c.noSePresento) throw AppError.noEncontrado('REPORTE_NO_ENCONTRADO', 'El reporte no existe');
    const p = await matchmakingApi.obtenerPartido(c.partidoId);
    const r = p?.reserva_id ? await bookingsApi.obtener(p.reserva_id) : undefined;
    if (!r || !bookingsApi.puedeGestionar(r, usuario)) throw AppError.noEncontrado('REPORTE_NO_ENCONTRADO', 'El reporte no existe');
    if (c.confirmadoPorAdmin) throw AppError.conflicto('REPORTE_YA_CONFIRMADO', 'Esta inasistencia ya fue confirmada.');
    // Registrar es idempotente por equipo y partido: si algo falla antes de marcar, se puede reintentar sin contar doble.
    await matchmakingApi.registrarInasistencia(c.equipoCalificadoId, c.partidoId);
    if (!(await repo.marcarConfirmada(c.id))) throw AppError.conflicto('REPORTE_YA_CONFIRMADO', 'Esta inasistencia ya fue confirmada.');
    return (await repo.obtenerDeEquipo(calificacionId))!;
  },

  promediosDeComplejos: (ids: number[]) => repo.promediosDeComplejos(ids),
  fairPlayDeEquipos: (ids: number[]) => repo.fairPlayDeEquipos(ids),
};
