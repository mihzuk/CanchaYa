/**
 * Cliente HTTP de prueba y creación de datos por rol para las pruebas de integración.
 */
import supertest from 'supertest';
import { createApp } from '../../src/app';
import type { MemoryMailer } from '../../src/infrastructure/email/Mailer';
import { mailer } from '../../src/infrastructure/email/SmtpMailer';
import { pool, query, queryOne } from '../../src/shared/database/pool';
import type { Rol } from '../../src/shared/middleware/authenticate';
import { reiniciarLimitadores } from '../../src/shared/middleware/rateLimiter';
import { firmarToken } from '../../src/shared/security/jwt';
import { hashContrasena } from '../../src/shared/security/password';

export const app = createApp();
export const api = () => supertest(app);
export const correos = mailer as MemoryMailer;
export { pool, query, queryOne };

/** Tablas con datos de catálogo que no se vacían entre pruebas. */
const CATALOGOS = new Set(['rol', 'servicio', 'parametro_sistema', 'schema_migraciones']);

/** Deja la base vacía (salvo catálogos) y reinicia contadores en memoria. */
export async function limpiarBd(): Promise<void> {
  const tablas = await query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  const aVaciar = tablas.map((t) => t.tablename).filter((t) => !CATALOGOS.has(t));
  if (aVaciar.length) await pool.query(`TRUNCATE ${aVaciar.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  correos.limpiar();
  reiniciarLimitadores();
}

export const CONTRASENA = 'Clave1234';

let secuencia = 0;

export interface UsuarioPrueba {
  id: number;
  correo: string;
  username: string;
  token: string;
  auth: { Authorization: string };
}

/** Crea un usuario directamente en la BD (más rápido que pasar por el registro). */
export async function crearUsuario(
  opciones: { rol?: Rol; correo?: string; username?: string; verificado?: boolean; estado?: string } = {},
): Promise<UsuarioPrueba> {
  secuencia++;
  const correo = opciones.correo ?? `usuario${secuencia}@prueba.co`;
  const username = opciones.username ?? `usuario${secuencia}`;
  const fila = await queryOne<{ id: number }>(
    `INSERT INTO usuario (rol_id, username, correo, contrasena_hash, nombres, apellidos, celular, fecha_nacimiento,
                          acepta_tratamiento_datos, correo_verificado, estado)
     VALUES ((SELECT id FROM rol WHERE nombre = $1), $2, $3, $4, 'Prueba', 'Usuario', '3001234567', '1995-05-10', TRUE, $5, $6)
     RETURNING id`,
    [opciones.rol ?? 'Jugador', username, correo, await hashContrasena(CONTRASENA), opciones.verificado ?? true, opciones.estado ?? 'activo'],
  );
  const { token } = firmarToken(fila!.id);
  return { id: fila!.id, correo, username, token, auth: { Authorization: `Bearer ${token}` } };
}

/** Extrae el token de un enlace de correo (`?token=...`). */
export function tokenDelCorreo(para: string): string {
  const correo = correos.ultimoPara(para);
  if (!correo) throw new Error(`No se envió correo a ${para}`);
  const m = /token=([A-Za-z0-9_\-%]+)/.exec(correo.texto);
  if (!m) throw new Error('El correo no tiene enlace con token');
  return decodeURIComponent(m[1]!);
}

/** Complejo activo con una cancha, horario de lunes a domingo 8:00-23:00 y tarifas diurna/nocturna. */
export async function crearComplejoActivo(admin: UsuarioPrueba, opciones: { nombre?: string; ciudad?: string } = {}) {
  const r = await api()
    .post('/api/complejos')
    .set(admin.auth)
    .send({
      nombre: opciones.nombre ?? 'Complejo La 70',
      direccion: 'Calle 70 # 10-20',
      ciudad: opciones.ciudad ?? 'Medellín',
      barrio: 'Laureles',
      telefono: '6041234567',
      servicioIds: [1, 2],
    });
  if (r.status !== 201) throw new Error(`No se creó el complejo: ${JSON.stringify(r.body)}`);
  const complejoId: number = r.body.complejo.id;
  await query("UPDATE complejo SET estado = 'activo' WHERE id = $1", [complejoId]);

  const c = await api()
    .post(`/api/complejos/${complejoId}/canchas`)
    .set(admin.auth)
    .send({ nombre: 'Cancha 1', tipoFutbol: 5, superficie: 'Sintética', techada: false, iluminacion: true });
  const canchaId: number = c.body.cancha.id;

  await api()
    .put(`/api/complejos/${complejoId}/horarios`)
    .set(admin.auth)
    .send({
      dias: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ diaSemana: d, horaApertura: '08:00', horaCierre: '23:00', duracionTurnoMin: 60 })),
    })
    .expect(200);
  await api().post(`/api/canchas/${canchaId}/tarifas`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '08:00', horaFin: '18:00', precio: 80000 }).expect(201);
  await api().post(`/api/canchas/${canchaId}/tarifas`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '18:00', horaFin: '23:00', precio: 120000 }).expect(201);
  return { complejoId, canchaId };
}
