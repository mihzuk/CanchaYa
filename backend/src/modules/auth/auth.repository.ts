import { query, queryOne, type Queryable } from '../../shared/database/pool';
import type { Rol, UsuarioSesion } from '../../shared/middleware/authenticate';
import type { Nivel, PerfilDto, Posicion, UsuarioDto } from './auth.dto';

/** Único lugar con SQL del módulo auth. Siempre consultas parametrizadas. */

export interface UsuarioFila {
  id: number;
  rol: Rol;
  username: string;
  correo: string;
  contrasena_hash: string;
  nombres: string;
  apellidos: string;
  celular: string;
  fecha_nacimiento: string;
  foto_url: string | null;
  posicion_preferida: Posicion | null;
  nivel: Nivel | null;
  estado: 'activo' | 'suspendido' | 'desactivado';
  correo_verificado: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
  fecha_registro: Date;
}

const SELECT_USUARIO = `
  SELECT u.id, r.nombre AS rol, u.username, u.correo, u.contrasena_hash, u.nombres, u.apellidos, u.celular,
         u.fecha_nacimiento, u.foto_url, u.posicion_preferida, u.nivel, u.estado, u.correo_verificado,
         u.intentos_fallidos, u.bloqueado_hasta, u.fecha_registro
    FROM usuario u
    JOIN rol r ON r.id = u.rol_id`;

export function aDto(u: UsuarioFila): UsuarioDto {
  return {
    id: u.id,
    username: u.username,
    correo: u.correo,
    nombres: u.nombres,
    apellidos: u.apellidos,
    celular: u.celular,
    fechaNacimiento: u.fecha_nacimiento,
    fotoUrl: u.foto_url,
    posicionPreferida: u.posicion_preferida,
    nivel: u.nivel,
    rol: u.rol,
    correoVerificado: u.correo_verificado,
    fechaRegistro: u.fecha_registro.toISOString(),
  };
}

export const authRepository = {
  buscarPorId(id: number, db?: Queryable) {
    return queryOne<UsuarioFila>(`${SELECT_USUARIO} WHERE u.id = $1`, [id], db);
  },

  buscarPorCorreo(correo: string, db?: Queryable) {
    return queryOne<UsuarioFila>(`${SELECT_USUARIO} WHERE u.correo = $1`, [correo], db);
  },

  buscarPorUsername(username: string, db?: Queryable) {
    return queryOne<UsuarioFila>(`${SELECT_USUARIO} WHERE lower(u.username) = lower($1)`, [username], db);
  },

  async existeCorreo(correo: string): Promise<boolean> {
    const fila = await queryOne<{ existe: boolean }>('SELECT EXISTS (SELECT 1 FROM usuario WHERE correo = $1) AS existe', [correo]);
    return fila?.existe ?? false;
  },

  async existeUsername(username: string): Promise<boolean> {
    const fila = await queryOne<{ existe: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM usuario WHERE lower(username) = lower($1)) AS existe',
      [username],
    );
    return fila?.existe ?? false;
  },

  async crear(
    datos: {
      username: string;
      correo: string;
      contrasenaHash: string;
      nombres: string;
      apellidos: string;
      celular: string;
      fechaNacimiento: string;
    },
    db?: Queryable,
  ): Promise<number> {
    const fila = await queryOne<{ id: number }>(
      `INSERT INTO usuario (rol_id, username, correo, contrasena_hash, nombres, apellidos, celular, fecha_nacimiento, acepta_tratamiento_datos)
       VALUES ((SELECT id FROM rol WHERE nombre = 'Jugador'), $1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id`,
      [datos.username, datos.correo, datos.contrasenaHash, datos.nombres, datos.apellidos, datos.celular, datos.fechaNacimiento],
      db,
    );
    return fila!.id;
  },

  /** Sesión para el middleware: datos mínimos para autorizar. */
  sesion(id: number) {
    return queryOne<UsuarioSesion>(
      `SELECT u.id, r.nombre AS rol, u.estado, u.correo_verificado AS "correoVerificado", u.nombres, u.correo,
              u.credenciales_desde AS "credencialesDesde"
         FROM usuario u JOIN rol r ON r.id = u.rol_id
        WHERE u.id = $1`,
      [id],
    );
  },

  /**
   * HU-02: suma un intento fallido de forma atómica. Al llegar a `maxIntentos` bloquea la cuenta
   * hasta `bloquearHasta` y reinicia el contador.
   */
  async registrarIntentoFallido(id: number, maxIntentos: number, bloquearHasta: Date): Promise<{ bloqueadoHasta: Date | null }> {
    const fila = await queryOne<{ bloqueado_hasta: Date | null }>(
      `UPDATE usuario
          SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
              bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2 THEN $3 ELSE bloqueado_hasta END
        WHERE id = $1
        RETURNING bloqueado_hasta`,
      [id, maxIntentos, bloquearHasta],
    );
    return { bloqueadoHasta: fila?.bloqueado_hasta ?? null };
  },

  async reiniciarIntentos(id: number, db?: Queryable): Promise<void> {
    await query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [id], db);
  },

  async marcarCorreoVerificado(id: number, db?: Queryable): Promise<void> {
    await query('UPDATE usuario SET correo_verificado = TRUE WHERE id = $1', [id], db);
  },

  async actualizarContrasena(id: number, hash: string, db?: Queryable): Promise<void> {
    await query(`UPDATE usuario
          SET contrasena_hash = $2, intentos_fallidos = 0, bloqueado_hasta = NULL, credenciales_desde = now()
        WHERE id = $1`, [id, hash], db);
  },

  async actualizarPerfil(id: number, p: PerfilDto): Promise<void> {
    await query(
      `UPDATE usuario
          SET nombres = $2, apellidos = $3, celular = $4, foto_url = $5, posicion_preferida = $6, nivel = $7
        WHERE id = $1`,
      [id, p.nombres, p.apellidos, p.celular, p.fotoUrl, p.posicionPreferida, p.nivel],
    );
  },

  /** Nombres visibles de varios usuarios (para el administrador del complejo; sin correo ni celular). */
  async nombres(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map();
    const filas = await query<{ id: number; nombre: string }>(
      "SELECT id, nombres || ' ' || apellidos AS nombre FROM usuario WHERE id = ANY($1::bigint[])",
      [ids],
    );
    return new Map(filas.map((f) => [f.id, f.nombre]));
  },

  /** Solo para enviar correos: nunca se expone en una respuesta. */
  async contactos(ids: number[]): Promise<Map<number, { correo: string; nombres: string }>> {
    if (!ids.length) return new Map();
    const filas = await query<{ id: number; correo: string; nombres: string }>("SELECT id, correo, nombres FROM usuario WHERE id = ANY($1::bigint[]) AND estado = 'activo'", [ids]);
    return new Map(filas.map((f) => [f.id, { correo: f.correo, nombres: f.nombres }]));
  },

  /** Datos públicos de varios usuarios activos (sin correo ni celular). */
  async publicos(ids: number[]): Promise<Map<number, { id: number; username: string; nombre: string; fotoUrl: string | null }>> {
    if (!ids.length) return new Map();
    const filas = await query<{ id: number; username: string; nombre: string; fotoUrl: string | null }>(
      `SELECT id, username, nombres || ' ' || apellidos AS nombre, foto_url AS "fotoUrl" FROM usuario WHERE id = ANY($1::bigint[]) AND estado <> 'desactivado'`,
      [ids],
    );
    return new Map(filas.map((f) => [f.id, f]));
  },

  /** Promueve a AdminComplejo solo si hoy es Jugador (no degrada a un Superadmin). */
  async promoverAAdminComplejo(id: number): Promise<void> {
    await query(
      `UPDATE usuario SET rol_id = (SELECT id FROM rol WHERE nombre = 'AdminComplejo')
        WHERE id = $1 AND rol_id = (SELECT id FROM rol WHERE nombre = 'Jugador')`,
      [id],
    );
  },

  // --- Tokens de correo (HU-01, HU-03) ------------------------------------------------------

  async crearToken(
    usuarioId: number,
    tipo: 'verificacion_correo' | 'recuperacion_clave',
    tokenHash: string,
    expira: Date,
    db?: Queryable,
  ): Promise<void> {
    // Un enlace nuevo invalida los anteriores del mismo tipo.
    await query('UPDATE token_usuario SET usado = TRUE WHERE usuario_id = $1 AND tipo = $2 AND NOT usado', [usuarioId, tipo], db);
    await query(
      'INSERT INTO token_usuario (usuario_id, tipo, token_hash, fecha_expiracion) VALUES ($1, $2, $3, $4)',
      [usuarioId, tipo, tokenHash, expira],
      db,
    );
  },

  /**
   * Marca el token como usado si es válido y vigente (un solo uso, atómico).
   * Devuelve el usuario, o el motivo por el que no se pudo usar.
   */
  async consumirToken(
    tokenHash: string,
    tipo: 'verificacion_correo' | 'recuperacion_clave',
    ahora: Date,
    db?: Queryable,
  ): Promise<{ usuarioId: number } | { error: 'invalido' | 'expirado' }> {
    const usado = await queryOne<{ usuario_id: number }>(
      `UPDATE token_usuario SET usado = TRUE
        WHERE token_hash = $1 AND tipo = $2 AND NOT usado AND fecha_expiracion > $3
        RETURNING usuario_id`,
      [tokenHash, tipo, ahora],
      db,
    );
    if (usado) return { usuarioId: usado.usuario_id };
    const existente = await queryOne<{ usado: boolean; fecha_expiracion: Date }>(
      'SELECT usado, fecha_expiracion FROM token_usuario WHERE token_hash = $1 AND tipo = $2',
      [tokenHash, tipo],
      db,
    );
    if (existente && !existente.usado && existente.fecha_expiracion <= ahora) return { error: 'expirado' };
    return { error: 'invalido' };
  },
};
