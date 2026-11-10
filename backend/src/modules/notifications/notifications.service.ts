import { mailer } from '../../infrastructure/email/SmtpMailer';
import { correoGenerico } from '../../infrastructure/email/templates';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { fechaLegible } from '../../shared/utils/time';
import { coincideConPreferencia, type PartidoParaAlerta } from './domain/alert-matching';
import type { PreferenciaInput } from './notifications.dto';
import { notificationsRepository as repo } from './notifications.repository';

/**
 * Servicio central de notificaciones (HT-07). Este módulo no importa a nadie: reacciona a eventos y la
 * composición (app.ts) le indica cómo consultar correos, capitanes y reservas.
 */
export interface DirectorioNotificaciones {
  contactos: (usuarioIds: number[]) => Promise<Map<number, { correo: string; nombres: string }>>;
  capitanes: (equipoIds: number[]) => Promise<Map<number, number>>;
  nombresEquipos: (equipoIds: number[]) => Promise<Map<number, string>>;
  reserva: (reservaId: number) => Promise<{ codigo: string; usuarioId: number | null; adminId: number; complejo: string; fecha: string; hora: string } | undefined>;
}

const vacio = async () => new Map();
let directorio: DirectorioNotificaciones = { contactos: vacio, capitanes: vacio, nombresEquipos: vacio, reserva: async () => undefined };
export function registrarDirectorioNotificaciones(d: DirectorioNotificaciones): void {
  directorio = d;
}
export const directorioActual = () => directorio;

export interface NuevaNotificacion {
  tipo: string;
  titulo: string;
  mensaje: string;
  referenciaTipo?: string;
  referenciaId?: number;
  /** También por correo (HU-28.1, HU-28.3). */
  correo?: boolean;
}

export const notificationsService = {
  /**
   * HT-07: la notificación en la plataforma se guarda siempre; si el correo falla, queda en el log y no
   * afecta a nada más. Un recordatorio repetido no se guarda ni se reenvía.
   */
  async notificar(usuarioId: number, n: NuevaNotificacion): Promise<void> {
    const creada = await repo.crear(usuarioId, n);
    if (!creada || !n.correo) return;
    try {
      const contacto = (await directorio.contactos([usuarioId])).get(usuarioId);
      if (contacto) await mailer.enviar(correoGenerico(contacto.correo, n.titulo, n.mensaje));
    } catch (err) {
      logger.error('No se pudo enviar el correo de la notificación', { tipo: n.tipo, error: (err as Error).message });
    }
  },

  /** Notifica al capitán de cada equipo (sin repetir). */
  async notificarCapitanes(equipoIds: (number | null | undefined)[], n: NuevaNotificacion): Promise<void> {
    const ids = [...new Set(equipoIds.filter((x): x is number => typeof x === 'number'))];
    const capitanes = await directorio.capitanes(ids);
    for (const usuarioId of new Set(capitanes.values())) await this.notificar(usuarioId, n);
  },

  listar: async (usuarioId: number, pagina: number, tamano: number) => ({
    notificaciones: await repo.listar(usuarioId, pagina, tamano),
    noLeidas: await repo.contarNoLeidas(usuarioId),
  }),
  noLeidas: (usuarioId: number) => repo.contarNoLeidas(usuarioId),

  async marcarLeida(id: number, usuarioId: number): Promise<void> {
    if (!(await repo.marcarLeida(id, usuarioId))) throw AppError.noEncontrado('NOTIFICACION_NO_ENCONTRADA', 'La notificación no existe');
  },
  marcarTodas: (usuarioId: number) => repo.marcarTodas(usuarioId),

  // --- HU-29 ----------------------------------------------------------------------------------
  preferencias: (usuarioId: number) => repo.preferenciasDe(usuarioId),

  async asegurarEquipoPropio(usuarioId: number, equipoId: number | null): Promise<void> {
    if (equipoId === null) return;
    if ((await directorio.capitanes([equipoId])).get(equipoId) !== usuarioId) throw AppError.prohibido('Solo puedes crear alertas para equipos que capitaneas.');
  },

  async crearPreferencia(usuarioId: number, p: PreferenciaInput) {
    await this.asegurarEquipoPropio(usuarioId, p.equipoId);
    return repo.crearPreferencia(usuarioId, p);
  },

  async actualizarPreferencia(id: number, usuarioId: number, p: PreferenciaInput) {
    await this.asegurarEquipoPropio(usuarioId, p.equipoId);
    const r = await repo.actualizarPreferencia(id, usuarioId, p);
    if (!r) throw AppError.noEncontrado('PREFERENCIA_NO_ENCONTRADA', 'La alerta no existe');
    return r;
  },

  async eliminarPreferencia(id: number, usuarioId: number): Promise<void> {
    if (!(await repo.eliminarPreferencia(id, usuarioId))) throw AppError.noEncontrado('PREFERENCIA_NO_ENCONTRADA', 'La alerta no existe');
  },

  /** HU-29.1: avisa a quienes tienen una preferencia compatible, sin incluir al equipo que publicó. */
  async alertarPartidoPublicado(partidoId: number, equipoId: number, partido: PartidoParaAlerta): Promise<void> {
    const capitan = (await directorio.capitanes([equipoId])).get(equipoId);
    const preferencias = await repo.preferenciasActivas();
    const destinatarios = new Set(preferencias.filter((p) => p.usuarioId !== capitan && coincideConPreferencia(p, partido)).map((p) => p.usuarioId));
    for (const usuarioId of destinatarios) {
      await this.notificar(usuarioId, {
        tipo: 'alerta_partido_compatible',
        titulo: 'Hay un partido que te puede servir',
        mensaje: `Se publicó un partido de fútbol ${partido.tipoFutbol} el ${fechaLegible(partido.fecha)} a las ${partido.horaInicio}, compatible con tus alertas.`,
        referenciaTipo: 'partido',
        referenciaId: partidoId,
      });
    }
  },
};
