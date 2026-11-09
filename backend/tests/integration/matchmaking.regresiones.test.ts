/** Regresiones de la revisión independiente del Sprint 3: equipos inactivos, cierre de partidos, expulsiones y fugas. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { matchmakingApi } from '../../src/modules/matchmaking';
import { endpointParaLog } from '../../src/shared/http/validar';
import { api, crearComplejoActivo, crearUsuario, limpiarBd, pagarAbono, pool, proximoDia, query, reservar, type UsuarioPrueba } from '../helpers/api';

let admin: UsuarioPrueba;
let capA: UsuarioPrueba;
let capB: UsuarioPrueba;
let canchaId: number;
let equipoA: number;
let equipoB: number;

const crearEquipo = async (u: UsuarioPrueba, nombre: string) =>
  (await api().post('/api/equipos').set(u.auth).send({ nombre, nivel: 'intermedio', tipoFutbol: 5 }).expect(201)).body.equipo.id as number;

async function reservaConfirmada(u: UsuarioPrueba, fecha = proximoDia(3), hora = '18:00') {
  const r = await reservar(u, canchaId, fecha, hora);
  await pagarAbono(u, r.id);
  return r.id;
}

async function publicar(extra: Record<string, unknown> = {}) {
  const reservaId = await reservaConfirmada(capA);
  const r = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId, equipoId: equipoA, nivelBuscado: 'intermedio', ...extra }).expect(201);
  return { id: r.body.partido.id as number, reservaId };
}

const estadoPartido = async (id: number) => (await api().get(`/api/partidos/${id}`).expect(200)).body.partido.estado as string;

beforeEach(async () => {
  await limpiarBd();
  admin = await crearUsuario();
  capA = await crearUsuario({ username: 'capitan_a' });
  capB = await crearUsuario({ username: 'capitan_b' });
  ({ canchaId } = await crearComplejoActivo(admin));
  equipoA = await crearEquipo(capA, 'Equipo A');
  equipoB = await crearEquipo(capB, 'Equipo B');
});
afterAll(() => pool.end());

describe('H1 · equipos inactivos', () => {
  it('si el publicador se inactiva, su partido se cancela y desaparece de la lista', async () => {
    const p = await publicar({ aceptacionAutomatica: true });
    await api().post(`/api/equipos/${equipoA}/salir`).set(capA.auth).expect(200);
    expect(await estadoPartido(p.id)).toBe('cancelado');
    expect((await api().get('/api/partidos')).body.partidos).toEqual([]);
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(409);
  });

  it('aunque el evento se pierda, las guardas impiden jugar contra un equipo inactivo', async () => {
    const p = await publicar({ aceptacionAutomatica: true });
    await query("UPDATE equipo SET estado = 'inactivo' WHERE id = $1", [equipoA]);
    expect((await api().get('/api/partidos')).body.partidos).toEqual([]);
    const r = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(409);
    expect(r.body.error.codigo).toBe('EQUIPO_NO_DISPONIBLE');
  });

  it('una postulación de un equipo que se inactivó ya no se puede aceptar', async () => {
    const p = await publicar();
    const a = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    await query("UPDATE equipo SET estado = 'inactivo' WHERE id = $1", [equipoB]);
    const r = await api().post(`/api/postulaciones/${a.body.postulacionId}/respuesta`).set(capA.auth).send({ aceptar: true }).expect(409);
    expect(r.body.error.codigo).toBe('EQUIPO_NO_DISPONIBLE');
  });

  it('si el rival confirmado se inactiva, el partido vuelve a buscar rival', async () => {
    const p = await publicar({ aceptacionAutomatica: true });
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    await api().post(`/api/equipos/${equipoB}/salir`).set(capB.auth).expect(200);
    const d = (await api().get(`/api/partidos/${p.id}`)).body.partido;
    expect(d).toMatchObject({ estado: 'buscando', equipoRival: null });
  });

  it('una solicitud "sin cancha" de un equipo inactivo no se puede aceptar', async () => {
    const fecha = proximoDia(3);
    const { body } = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_partido_sin_cancha', equipoId: equipoA, nivelBuscado: 'intermedio', fechaPreferida: fecha, rangoHoraInicio: '17:00', rangoHoraFin: '21:00', zona: 'Sur' }).expect(201);
    await query("UPDATE equipo SET estado = 'inactivo' WHERE id = $1", [equipoA]);
    const reservaId = await reservaConfirmada(capB, fecha);
    const r = await api().post(`/api/partidos/${body.partido.id}/aceptar-con-reserva`).set(capB.auth).send({ equipoId: equipoB, reservaId }).expect(409);
    expect(r.body.error.codigo).toBe('EQUIPO_NO_DISPONIBLE');
  });

  it('el único miembro que sale deja de ser miembro', async () => {
    await api().post(`/api/equipos/${equipoA}/salir`).set(capA.auth).expect(200);
    expect((await api().get(`/api/equipos/${equipoA}`).set(capA.auth)).body).toMatchObject({ esMiembro: false, esCapitan: false, miembros: [] });
  });
});

describe('M3 · publicador suspendido', () => {
  it('no aparece en la lista, no recibe rivales y no puede aceptarlos', async () => {
    const p = await publicar();
    const a = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    await query("UPDATE equipo SET suspendido_hasta = now() + interval '5 days' WHERE id = $1", [equipoA]);
    expect((await api().get('/api/partidos')).body.partidos).toEqual([]);
    expect((await api().post(`/api/postulaciones/${a.body.postulacionId}/respuesta`).set(capA.auth).send({ aceptar: true }).expect(403)).body.error.codigo).toBe('EQUIPO_SUSPENDIDO');
  });
});

describe('H2 y M1 · cierre del partido cuando termina la reserva', () => {
  async function conRival() {
    const p = await publicar({ aceptacionAutomatica: true });
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    return p;
  }
  const yaOcurrio = (id: number) => query('UPDATE reserva SET fecha = fecha - 14 WHERE id = $1', [id]);

  it('al completarse la reserva el partido queda "jugado"', async () => {
    const p = await conRival();
    await yaOcurrio(p.reservaId);
    await api().patch(`/api/reservas/${p.reservaId}/estado`).set(admin.auth).send({ estado: 'completada' }).expect(200);
    expect(await estadoPartido(p.id)).toBe('jugado');
  });

  it('un "no asistió" cierra el partido como cancelado', async () => {
    const p = await conRival();
    await yaOcurrio(p.reservaId);
    await api().patch(`/api/reservas/${p.reservaId}/estado`).set(admin.auth).send({ estado: 'no_asistio' }).expect(200);
    expect(await estadoPartido(p.id)).toBe('cancelado');
  });

  it('un partido sin rival cuya reserva se completó se cancela (nunca se jugó como partido abierto)', async () => {
    const p = await publicar();
    await yaOcurrio(p.reservaId);
    await api().patch(`/api/reservas/${p.reservaId}/estado`).set(admin.auth).send({ estado: 'completada' }).expect(200);
    expect(await estadoPartido(p.id)).toBe('cancelado');
  });

  it('no se puede cancelar un partido que ya empezó', async () => {
    const p = await conRival();
    await yaOcurrio(p.reservaId);
    expect((await api().post(`/api/partidos/${p.id}/cancelar`).set(capA.auth).expect(409)).body.error.codigo).toBe('PARTIDO_INICIADO');
  });

  it('la reconciliación cierra los partidos cuyo evento se perdió y es idempotente', async () => {
    const p = await conRival();
    const q = await publicarOtro();
    await query("UPDATE reserva SET estado = 'completada' WHERE id = $1", [p.reservaId]);
    await query("UPDATE reserva SET estado = 'cancelada' WHERE id = $1", [q.reservaId]);
    expect(await matchmakingApi.reconciliar()).toBe(2);
    expect(await estadoPartido(p.id)).toBe('jugado');
    expect(await estadoPartido(q.id)).toBe('cancelado');
    expect(await matchmakingApi.reconciliar()).toBe(0);
  });

  async function publicarOtro() {
    const reservaId = await reservaConfirmada(capA, proximoDia(4));
    const r = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId, equipoId: equipoA, nivelBuscado: 'intermedio' }).expect(201);
    return { id: r.body.partido.id as number, reservaId };
  }
});

describe('H3 · expulsión', () => {
  it('el expulsado no vuelve con el enlace que ya conocía', async () => {
    const { body } = await api().post(`/api/equipos/${equipoA}/enlaces`).set(capA.auth).expect(201);
    const j = await crearUsuario();
    await api().post(`/api/enlaces-equipo/${body.token}/unirse`).set(j.auth).expect(200);
    await api().delete(`/api/equipos/${equipoA}/miembros/${j.id}`).set(capA.auth).expect(204);
    expect((await api().post(`/api/enlaces-equipo/${body.token}/unirse`).set(j.auth).expect(400)).body.error.codigo).toBe('TOKEN_INVALIDO');
    await api().get(`/api/equipos/${equipoA}/partidos`).set(j.auth).expect(403);
  });

  it('el expulsado no vuelve con una invitación pendiente', async () => {
    const j = await crearUsuario({ username: 'jugador_x' });
    const { body } = await api().post(`/api/equipos/${equipoA}/enlaces`).set(capA.auth).expect(201);
    await api().post(`/api/enlaces-equipo/${body.token}/unirse`).set(j.auth).expect(200);
    await api().post(`/api/equipos/${equipoB}/invitaciones`).set(capB.auth).send({ username: 'jugador_x' }).expect(201);
    // Invitación pendiente al mismo equipo creada antes de la expulsión.
    await query('INSERT INTO invitacion_equipo (equipo_id, usuario_invitado_id) VALUES ($1, $2)', [equipoA, j.id]);
    await api().delete(`/api/equipos/${equipoA}/miembros/${j.id}`).set(capA.auth).expect(204);
    const pendientes = (await api().get('/api/mis-invitaciones').set(j.auth)).body.invitaciones;
    expect(pendientes.map((i: { equipo: { id: number } }) => i.equipo.id)).toEqual([equipoB]);
  });
});

describe('M4, M5 y entradas', () => {
  it('los logs usan el patrón de la ruta, sin el token', () => {
    expect(endpointParaLog({ method: 'GET', baseUrl: '/api', originalUrl: '/api/enlaces-equipo/SECRETO?x=1', route: { path: '/enlaces-equipo/:token' } })).toBe('GET /api/enlaces-equipo/:token');
    expect(endpointParaLog({ method: 'GET', baseUrl: '', originalUrl: '/api/nada?token=SECRETO' })).toBe('GET /api/nada');
  });

  it('un usuario desactivado no aparece en la plantilla pública; la propuesta de capitanía es privada', async () => {
    const { body } = await api().post(`/api/equipos/${equipoA}/enlaces`).set(capA.auth).expect(201);
    const j = await crearUsuario({ username: 'desactivado1' });
    await api().post(`/api/enlaces-equipo/${body.token}/unirse`).set(j.auth).expect(200);
    await api().post(`/api/equipos/${equipoA}/capitania`).set(capA.auth).send({ usuarioId: j.id }).expect(200);
    expect((await api().get(`/api/equipos/${equipoA}`)).body.equipo.capitanPropuestoId).toBeNull();
    await query("UPDATE usuario SET estado = 'desactivado' WHERE id = $1", [j.id]);
    const r = await api().get(`/api/equipos/${equipoA}`).expect(200);
    expect(r.body.miembros.map((m: { usuarioId: number }) => m.usuarioId)).toEqual([capA.id]);
    expect(JSON.stringify(r.body)).not.toContain('desactivado1');
  });

  it('L1: un carácter NUL responde 400, no 500', async () => {
    const r = await api().post('/api/equipos').set(capA.auth).send({ nombre: 'Equi\u0000po', nivel: 'intermedio', tipoFutbol: 5 }).expect(400);
    expect(r.body.error.codigo).toBe('CARACTER_INVALIDO');
  });

  it('L2: un porcentaje nulo se rechaza en vez de convertirse en 0 %', async () => {
    const reservaId = await reservaConfirmada(capA);
    await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId, equipoId: equipoA, nivelBuscado: 'intermedio', porcentajePagoRival: null }).expect(400);
  });

  it('L4: republicar con el mismo equipo responde YA_PUBLICADA', async () => {
    const p = await publicar();
    const r = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: p.reservaId, equipoId: equipoA, nivelBuscado: 'intermedio' }).expect(409);
    expect(r.body.error.codigo).toBe('YA_PUBLICADA');
  });

  it('L9: una solicitud "sin cancha" sale de la lista cuando pasa su rango de horas', async () => {
    const { body } = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_partido_sin_cancha', equipoId: equipoA, nivelBuscado: 'intermedio', fechaPreferida: proximoDia(3), rangoHoraInicio: '17:00', rangoHoraFin: '21:00', zona: 'Sur' }).expect(201);
    expect((await api().get('/api/partidos')).body.partidos).toHaveLength(1);
    await query("UPDATE partido_abierto SET fecha_preferida = (now() AT TIME ZONE 'America/Bogota')::date - 1 WHERE id = $1", [body.partido.id]);
    expect((await api().get('/api/partidos')).body.partidos).toEqual([]);
  });
});

describe('M8, L3 y HU-25.1 · solicitudes propias', () => {
  it('el detalle devuelve mi solicitud, que se puede retirar', async () => {
    const p = await publicar();
    const a = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    const d = await api().get(`/api/partidos/${p.id}`).set(capB.auth).expect(200);
    expect(d.body.miPostulacion).toEqual({ id: a.body.postulacionId, equipoId: equipoB, estado: 'pendiente' });
    expect(d.body.miInscripcion).toBeNull();
    expect((await api().get(`/api/partidos/${p.id}`)).body).toMatchObject({ miPostulacion: null, miInscripcion: null });
  });

  it('la posición deseada se publica; quien fue rechazado por cupo lleno puede volver a pedir cuando se libera', async () => {
    const reservaId = await reservaConfirmada(capA);
    const pub = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'faltan_jugadores', reservaId, equipoId: equipoA, nivelBuscado: 'intermedio', cuposDisponibles: 1, posicionDeseada: 'arquero' }).expect(201);
    expect(pub.body.partido.posicionDeseada).toBe('arquero');
    const id = pub.body.partido.id;
    const [j1, j2] = [await crearUsuario(), await crearUsuario()];
    const i1 = await api().post(`/api/partidos/${id}/inscripciones`).set(j1.auth).send({}).expect(201);
    await api().post(`/api/partidos/${id}/inscripciones`).set(j2.auth).send({}).expect(201);
    await api().post(`/api/inscripciones/${i1.body.inscripcion.id}/respuesta`).set(capA.auth).send({ aceptar: true }).expect(200); // j2 queda rechazado
    await api().delete(`/api/inscripciones/${i1.body.inscripcion.id}`).set(j1.auth).expect(204); // se libera el cupo
    expect((await api().post(`/api/partidos/${id}/inscripciones`).set(j2.auth).send({}).expect(201)).body.inscripcion.estado).toBe('pendiente');
  });
});
