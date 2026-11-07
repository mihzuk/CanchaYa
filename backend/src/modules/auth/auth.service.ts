import { mailer } from '../../infrastructure/email/SmtpMailer';
import { correoRecuperacion, correoVerificacion } from '../../infrastructure/email/templates';
import { esErrorPg, PG_ERRORES, withTransaction } from '../../shared/database/pool';
import { AppError } from '../../shared/errors/AppError';
import { eventBus } from '../../shared/events/eventBus';
import { auditar } from '../../shared/logger/audit';
import { firmarToken } from '../../shared/security/jwt';
import { hashContrasena, hashParaComparacionFicticia, verificarContrasena } from '../../shared/security/password';
import { generarToken, hashToken } from '../../shared/security/tokens';
import './auth.events';
import type { LoginDto, PerfilDto, PerfilPublicoDto, RegistroDto, SesionDto, UsuarioDto } from './auth.dto';
import { aDto, authRepository } from './auth.repository';

/** HU-02 / HT-04 */
export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
/** HU-03: el enlace de recuperación vale 30 minutos. */
export const MINUTOS_RECUPERACION = 30;
export const HORAS_VERIFICACION = 24;

const MENSAJE_RECUPERACION =
  'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña. Revisa tu bandeja de entrada.';

// --- Perfil público extensible ---------------------------------------------------------------
// Partidos jugados, fair play y equipos viven en otros módulos (teams, matchmaking, ratings).
// Para no crear dependencias de auth hacia ellos, cada módulo registra un "contribuyente".
type ExtrasPerfil = Partial<Pick<PerfilPublicoDto, 'partidosJugados' | 'fairPlay' | 'equipos'>>;
type ContribuyentePerfil = (usuarioId: number) => Promise<ExtrasPerfil>;
const contribuyentesPerfil: ContribuyentePerfil[] = [];

export function registrarContribuyentePerfil(fn: ContribuyentePerfil): void {
  contribuyentesPerfil.push(fn);
}

async function enviarVerificacion(usuarioId: number, correo: string, nombres: string): Promise<void> {
  const token = generarToken();
  const expira = new Date(Date.now() + HORAS_VERIFICACION * 3600_000);
  await authRepository.crearToken(usuarioId, 'verificacion_correo', hashToken(token), expira);
  await mailer.enviar(correoVerificacion(correo, nombres, token));
}

export const authService = {
  /** HU-01: crea la cuenta con rol Jugador y envía el correo de verificación. */
  async registrar(dto: RegistroDto): Promise<SesionDto> {
    if (await authRepository.existeCorreo(dto.correo)) {
      throw AppError.conflicto('CORREO_EN_USO', 'El correo ya está en uso');
    }
    if (await authRepository.existeUsername(dto.username)) {
      throw AppError.conflicto('USERNAME_EN_USO', 'El nombre de usuario ya está en uso');
    }
    const contrasenaHash = await hashContrasena(dto.contrasena);
    let id: number;
    try {
      id = await authRepository.crear({ ...dto, contrasenaHash });
    } catch (err) {
      // Dos registros simultáneos con el mismo correo: la restricción UNIQUE decide.
      if (esErrorPg(err, PG_ERRORES.UNIQUE, 'usuario_correo_uk')) throw AppError.conflicto('CORREO_EN_USO', 'El correo ya está en uso');
      if (esErrorPg(err, PG_ERRORES.UNIQUE, 'usuario_username_uk')) {
        throw AppError.conflicto('USERNAME_EN_USO', 'El nombre de usuario ya está en uso');
      }
      throw err;
    }
    auditar('usuario.registro', { usuarioId: id });
    await enviarVerificacion(id, dto.correo, dto.nombres);
    await eventBus.emit('UsuarioRegistrado', { usuarioId: id });
    const usuario = await authRepository.buscarPorId(id);
    return { ...firmarToken(id), usuario: aDto(usuario!) };
  },

  /** HU-02 / HT-04: login con bloqueo de 15 minutos tras 5 intentos fallidos seguidos. */
  async iniciarSesion(dto: LoginDto, ahora = new Date()): Promise<SesionDto> {
    const usuario = await authRepository.buscarPorCorreo(dto.correo);
    if (!usuario) {
      // Misma duración que con un correo real: no revela qué correos existen.
      await verificarContrasena(dto.contrasena, await hashParaComparacionFicticia());
      throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
    }

    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > ahora) {
      throw cuentaBloqueada(usuario.bloqueado_hasta, ahora);
    }

    const valida = await verificarContrasena(dto.contrasena, usuario.contrasena_hash);
    if (!valida) {
      const { bloqueadoHasta } = await authRepository.registrarIntentoFallido(
        usuario.id,
        MAX_INTENTOS,
        new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60_000),
      );
      if (bloqueadoHasta && bloqueadoHasta > ahora) {
        auditar('usuario.bloqueo', { usuarioId: usuario.id, hasta: bloqueadoHasta.toISOString() });
        throw cuentaBloqueada(bloqueadoHasta, ahora);
      }
      throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
    }

    if (usuario.estado !== 'activo') {
      throw new AppError(403, 'CUENTA_INACTIVA', 'Tu cuenta está suspendida o desactivada. Contacta al soporte.');
    }

    if (usuario.intentos_fallidos > 0 || usuario.bloqueado_hasta) await authRepository.reiniciarIntentos(usuario.id);
    auditar('usuario.login', { usuarioId: usuario.id });
    return { ...firmarToken(usuario.id), usuario: aDto(usuario) };
  },

  async obtenerUsuario(id: number): Promise<UsuarioDto> {
    const usuario = await authRepository.buscarPorId(id);
    if (!usuario) throw AppError.noEncontrado('USUARIO_NO_ENCONTRADO', 'El usuario no existe');
    return aDto(usuario);
  },

  /** HU-04 */
  async actualizarPerfil(id: number, dto: PerfilDto): Promise<UsuarioDto> {
    await authRepository.actualizarPerfil(id, dto);
    return this.obtenerUsuario(id);
  },

  /** Cambia la contraseña, cierra las demás sesiones y devuelve un token nuevo para esta. */
  async cambiarContrasena(id: number, actual: string, nueva: string): Promise<{ token: string; expiraEn: number }> {
    const usuario = await authRepository.buscarPorId(id);
    if (!usuario) throw AppError.noEncontrado('USUARIO_NO_ENCONTRADO', 'El usuario no existe');
    if (!(await verificarContrasena(actual, usuario.contrasena_hash))) {
      throw new AppError(400, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta');
    }
    await authRepository.actualizarContrasena(id, await hashContrasena(nueva));
    auditar('usuario.contrasena_restablecida', { usuarioId: id, origen: 'perfil' });
    return firmarToken(id);
  },

  /** HU-01 criterio 4: confirmar el correo con el enlace recibido. */
  async verificarCorreo(token: string, ahora = new Date()): Promise<void> {
    await withTransaction(async (db) => {
      const r = await authRepository.consumirToken(hashToken(token), 'verificacion_correo', ahora, db);
      if ('error' in r) throw errorDeToken(r.error);
      await authRepository.marcarCorreoVerificado(r.usuarioId, db);
    });
  },

  async reenviarVerificacion(id: number): Promise<void> {
    const usuario = await authRepository.buscarPorId(id);
    if (!usuario || usuario.correo_verificado) return;
    await enviarVerificacion(usuario.id, usuario.correo, usuario.nombres);
  },

  /**
   * HU-03 criterio 1: enlace válido por 30 minutos. La respuesta es siempre la misma para no revelar
   * si el correo existe; el envío no se espera para que el tiempo de respuesta tampoco lo revele.
   */
  async solicitarRecuperacion(correo: string): Promise<{ mensaje: string }> {
    const usuario = await authRepository.buscarPorCorreo(correo);
    if (usuario && usuario.estado === 'activo') {
      const token = generarToken();
      const expira = new Date(Date.now() + MINUTOS_RECUPERACION * 60_000);
      await authRepository.crearToken(usuario.id, 'recuperacion_clave', hashToken(token), expira);
      void mailer.enviar(correoRecuperacion(usuario.correo, usuario.nombres, token, MINUTOS_RECUPERACION));
    }
    return { mensaje: MENSAJE_RECUPERACION };
  },

  /** HU-03 criterio 2: un enlace vencido pide solicitar uno nuevo. */
  async restablecerContrasena(token: string, contrasena: string, ahora = new Date()): Promise<void> {
    const hash = await hashContrasena(contrasena);
    const usuarioId = await withTransaction(async (db) => {
      const r = await authRepository.consumirToken(hashToken(token), 'recuperacion_clave', ahora, db);
      if ('error' in r) throw errorDeToken(r.error);
      await authRepository.actualizarContrasena(r.usuarioId, hash, db);
      return r.usuarioId;
    });
    auditar('usuario.contrasena_restablecida', { usuarioId });
  },

  /** HU-04 criterio 2: perfil público sin correo ni celular. */
  async perfilPublico(username: string): Promise<PerfilPublicoDto> {
    const u = await authRepository.buscarPorUsername(username);
    if (!u || u.estado === 'desactivado') throw AppError.noEncontrado('USUARIO_NO_ENCONTRADO', 'El jugador no existe');
    const perfil: PerfilPublicoDto = {
      username: u.username,
      nombres: u.nombres,
      apellidos: u.apellidos,
      fotoUrl: u.foto_url,
      posicionPreferida: u.posicion_preferida,
      nivel: u.nivel,
      fechaRegistro: u.fecha_registro.toISOString(),
      partidosJugados: 0,
      fairPlay: null,
      equipos: [],
    };
    const extras = await Promise.all(contribuyentesPerfil.map((fn) => fn(u.id)));
    return Object.assign(perfil, ...extras);
  },

  /** Usado por el middleware `authenticate`. */
  sesion(id: number) {
    return authRepository.sesion(id);
  },

  promoverAAdminComplejo(id: number) {
    return authRepository.promoverAAdminComplejo(id);
  },
};

function cuentaBloqueada(hasta: Date, ahora: Date): AppError {
  const minutos = Math.max(1, Math.ceil((hasta.getTime() - ahora.getTime()) / 60_000));
  return new AppError(
    403,
    'CUENTA_BLOQUEADA',
    `Tu cuenta está bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
  );
}

function errorDeToken(tipo: 'invalido' | 'expirado'): AppError {
  return tipo === 'expirado'
    ? new AppError(400, 'TOKEN_EXPIRADO', 'El enlace expiró. Solicita uno nuevo.')
    : new AppError(400, 'TOKEN_INVALIDO', 'El enlace no es válido o ya fue usado.');
}
