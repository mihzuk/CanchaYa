/** Pruebas de integración de EP-06: publicar, explorar, postularse y completar jugadores (HU-22 a HU-25, RN-08 a RN-11). */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { partesBogota } from '../../src/shared/utils/time';
import { api, crearComplejoActivo, crearUsuario, limpiarBd, pagarAbono, pool, proximoDia, query, reservar, type UsuarioPrueba } from '../helpers/api';

let admin: UsuarioPrueba;
let capA: UsuarioPrueba;
let capB: UsuarioPrueba;
let canchaId: number;
let complejoId: number;
let equipoA: number;
let equipoB: number;

const crearEquipo = async (u: UsuarioPrueba, nombre: string, tipoFutbol = 5) =>
  (await api().post('/api/equipos').set(u.auth).send({ nombre, nivel: 'intermedio', tipoFutbol }).expect(201)).body.equipo.id as number;

/** Reserva confirmada (abono pagado) del capitán. */
async function reservaConfirmada(u: UsuarioPrueba, fecha = proximoDia(3), hora = '18:00', cancha = canchaId) {
  const r = await reservar(u, cancha, fecha, hora);
  await pagarAbono(u, r.id);
  return r.id;
}

async function publicarRival(extra: Record<string, unknown> = {}, reservaId?: number) {
  const id = reservaId ?? (await reservaConfirmada(capA));
  const r = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: id, equipoId: equipoA, nivelBuscado: 'intermedio', ...extra }).expect(201);
  return r.body.partido as { id: number; estado: string; valorPorEquipo: { publicador: number; rival: number }; reserva: { id: number } };
}

async function publicarFaltan(cupos = 2, aporte = 12000) {
  const reservaId = await reservaConfirmada(capA);
  const r = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'faltan_jugadores', reservaId, equipoId: equipoA, nivelBuscado: 'intermedio', cuposDisponibles: cupos, aportePorJugador: aporte }).expect(201);
  return r.body.partido as { id: number };
}

/**
 * Hace coincidir de forma determinista dos operaciones sobre un partido: retiene su fila, las lanza,
 * les da tiempo de llegar y la suelta. Sin bloqueo en el código, ambas leerían el mismo estado.
 */
async function aLaVez<T>(partidoId: number, operaciones: (() => PromiseLike<T>)[]): Promise<T[]> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT id FROM partido_abierto WHERE id = $1 FOR UPDATE', [partidoId]);
    const enCurso = operaciones.map((op) => Promise.resolve(op()));
    await new Promise((r) => setTimeout(r, 400));
    await c.query('COMMIT');
    return await Promise.all(enCurso);
  } finally {
    c.release();
  }
}

beforeEach(async () => {
  await limpiarBd();
  admin = await crearUsuario();
  capA = await crearUsuario({ username: 'capitan_a' });
  capB = await crearUsuario({ username: 'capitan_b' });
  ({ canchaId, complejoId } = await crearComplejoActivo(admin, { ciudad: 'Cali' }));
  equipoA = await crearEquipo(capA, 'Equipo A');
  equipoB = await crearEquipo(capB, 'Equipo B');
});
afterAll(() => pool.end());

describe('HU-22 · publicar partido abierto', () => {
  it('crea el partido "buscando" con el valor por equipo y aparece en la lista', async () => {
    const p = await publicarRival();
    expect(p.estado).toBe('buscando');
    expect(p.valorPorEquipo).toEqual({ publicador: 60000, rival: 60000 });
    const lista = await api().get('/api/partidos').expect(200);
    expect(lista.body.partidos).toHaveLength(1);
    expect(lista.body.partidos[0]).toMatchObject({
      equipoPublicador: { nombre: 'Equipo A', nivel: 'intermedio', fairPlay: null },
      reserva: { cancha: 'Cancha 1', complejo: { ciudad: 'Cali' } },
    });
    expect(JSON.stringify(lista.body)).not.toMatch(/codigo|correo|celular/);
  });

  it('respeta el porcentaje acordado', async () => {
    const p = await publicarRival({ porcentajePagoRival: 25 });
    expect(p.valorPorEquipo).toEqual({ publicador: 90000, rival: 30000 });
  });

  it('RN-09: rechaza una reserva sin confirmar o con menos de 3 horas', async () => {
    const sinPagar = await reservar(capA, canchaId, proximoDia(3), '19:00');
    const body = { modalidad: 'busco_rival', reservaId: sinPagar.id, equipoId: equipoA, nivelBuscado: 'intermedio' };
    expect((await api().post('/api/partidos').set(capA.auth).send(body).expect(409)).body.error.codigo).toBe('RESERVA_NO_CONFIRMADA');
    const id = await reservaConfirmada(capA);
    const pronto = partesBogota(new Date(Date.now() + 2 * 3_600_000));
    await query('UPDATE reserva SET fecha = $2, hora_inicio = $3, hora_fin = $3::time + interval \'1 minute\' WHERE id = $1', [id, pronto.fecha, pronto.hora]);
    expect((await api().post('/api/partidos').set(capA.auth).send({ ...body, reservaId: id }).expect(409)).body.error.codigo).toBe('ANTICIPACION_INSUFICIENTE');
  });

  it('RNF-02: solo el dueño de la reserva y capitán del equipo puede publicar', async () => {
    const id = await reservaConfirmada(capA);
    await api().post('/api/partidos').set(capB.auth).send({ modalidad: 'busco_rival', reservaId: id, equipoId: equipoB, nivelBuscado: 'intermedio' }).expect(404);
    await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: id, equipoId: equipoB, nivelBuscado: 'intermedio' }).expect(403);
  });

  it('una reserva no se publica dos veces, pero sí después de cancelar el partido', async () => {
    const p = await publicarRival();
    const body = { modalidad: 'busco_rival', reservaId: p.reserva.id, equipoId: equipoA, nivelBuscado: 'intermedio' };
    expect((await api().post('/api/partidos').set(capA.auth).send(body).expect(409)).body.error.codigo).toMatch(/YA_PUBLICADA|CRUCE_DE_HORARIO/);
    await api().post(`/api/partidos/${p.id}/cancelar`).set(capA.auth).expect(200);
    await api().post('/api/partidos').set(capA.auth).send(body).expect(201);
  });

  it('el equipo debe ser de la modalidad de la cancha', async () => {
    const siete = await crearEquipo(capA, 'Equipo Siete', 7);
    const id = await reservaConfirmada(capA);
    expect((await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: id, equipoId: siete, nivelBuscado: 'intermedio' }).expect(409)).body.error.codigo).toBe('MODALIDAD_INCOMPATIBLE');
  });

  it('RN-08: un equipo suspendido no publica ni se postula', async () => {
    const p = await publicarRival();
    await query("UPDATE equipo SET suspendido_hasta = now() + interval '5 days' WHERE id = ANY($1::bigint[])", [[equipoB]]);
    expect((await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(403)).body.error.codigo).toBe('EQUIPO_SUSPENDIDO');
    const id = await reservaConfirmada(capB, proximoDia(4));
    expect((await api().post('/api/partidos').set(capB.auth).send({ modalidad: 'busco_rival', reservaId: id, equipoId: equipoB, nivelBuscado: 'intermedio' }).expect(403)).body.error.codigo).toBe('EQUIPO_SUSPENDIDO');
  });

  it('HU-12.4: al cancelar la reserva se cancela su partido', async () => {
    const p = await publicarRival();
    await api().post(`/api/reservas/${p.reserva.id}/cancelar`).set(capA.auth).send({}).expect(200);
    expect((await api().get(`/api/partidos/${p.id}`)).body.partido.estado).toBe('cancelado');
    expect((await api().get('/api/partidos')).body.partidos).toEqual([]);
  });

  it('HU-10.2: la franja con partido abierto se ve en amarillo', async () => {
    const p = await publicarRival();
    const r = (await query<{ fecha: string }>('SELECT fecha FROM reserva WHERE id = $1', [p.reserva.id]))[0]!;
    const g = await api().get(`/api/complejos/${complejoId}/disponibilidad?fecha=${r.fecha}`).expect(200);
    expect(g.body.canchas[0].franjas.find((f: { horaInicio: string }) => f.horaInicio === '18:00').estado).toBe('partido_abierto');
  });
});

describe('HU-23 · explorar', () => {
  it('filtra por fecha, horas, ciudad, modalidad, nivel y tipo', async () => {
    const fecha = proximoDia(3);
    await publicarRival();
    const q = (s: string) => api().get(`/api/partidos?${s}`).expect(200).then((r) => r.body.partidos.length as number);
    expect(await q(`fecha=${fecha}&ciudad=cali&horaDesde=17:00&horaHasta=19:00&tipoFutbol=5&nivel=intermedio&modalidad=busco_rival`)).toBe(1);
    expect(await q('ciudad=medellin')).toBe(0);
    expect(await q('nivel=avanzado')).toBe(0);
    expect(await q('modalidad=faltan_jugadores')).toBe(0);
    expect(await q('tipoFutbol=7')).toBe(0);
    expect(await q('horaDesde=19:00')).toBe(0);
    expect(await q(`fecha=${proximoDia(4)}`)).toBe(0);
  });

  it('un partido con rival confirmado ya no aparece; uno que ya empezó tampoco', async () => {
    const p = await publicarRival({ aceptacionAutomatica: true });
    const otra = await reservaConfirmada(capB, proximoDia(4));
    await api().post('/api/partidos').set(capB.auth).send({ modalidad: 'busco_rival', reservaId: otra, equipoId: equipoB, nivelBuscado: 'intermedio' }).expect(201);
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    const lista = (await api().get('/api/partidos')).body.partidos;
    expect(lista.map((x: { id: number }) => x.id)).not.toContain(p.id);
    await query('UPDATE reserva SET fecha = fecha - 30');
    expect((await api().get('/api/partidos')).body.partidos).toEqual([]);
  });

  it('el detalle muestra el perfil del publicador y sus últimos resultados', async () => {
    const p = await publicarRival();
    await query("UPDATE partido_abierto SET estado = 'jugado', equipo_rival_id = $2, goles_publicador = 3, goles_rival = 1 WHERE id = $1", [p.id, equipoB]);
    const nueva = await reservaConfirmada(capA, proximoDia(4));
    const n = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: nueva, equipoId: equipoA, nivelBuscado: 'intermedio' }).expect(201);
    const d = await api().get(`/api/partidos/${n.body.partido.id}`).set(capA.auth).expect(200);
    expect(d.body.esCapitanPublicador).toBe(true);
    expect(d.body.ultimosResultados[0]).toMatchObject({ golesPropios: 3, golesRival: 1 });
  });
});

describe('HU-24 · postularse como rival', () => {
  it('crea una solicitud pendiente; al aceptar queda "rival confirmado" y las demás se rechazan', async () => {
    const capC = await crearUsuario({ username: 'capitan_c' });
    const equipoC = await crearEquipo(capC, 'Equipo C');
    const p = await publicarRival();
    const a = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    expect(a.body.confirmado).toBe(false);
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capC.auth).send({ equipoId: equipoC }).expect(201);
    await api().get(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).expect(403);

    const lista = await api().get(`/api/partidos/${p.id}/postulaciones`).set(capA.auth).expect(200);
    expect(lista.body.postulaciones.map((x: { estado: string }) => x.estado)).toEqual(['pendiente', 'pendiente']);
    await api().post(`/api/postulaciones/${a.body.postulacionId}/respuesta`).set(capB.auth).send({ aceptar: true }).expect(403);
    const r = await api().post(`/api/postulaciones/${a.body.postulacionId}/respuesta`).set(capA.auth).send({ aceptar: true }).expect(200);
    expect(r.body.partido).toMatchObject({ estado: 'rival_confirmado', equipoRival: { id: equipoB } });
    const fin = await api().get(`/api/partidos/${p.id}/postulaciones`).set(capA.auth).expect(200);
    expect(fin.body.postulaciones.map((x: { estado: string }) => x.estado).sort()).toEqual(['aceptada', 'rechazada']);
  });

  it('aceptación automática: el primero queda confirmado; el segundo ya no puede', async () => {
    const capC = await crearUsuario();
    const equipoC = await crearEquipo(capC, 'Equipo C');
    const p = await publicarRival({ aceptacionAutomatica: true });
    const r = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    expect(r.body).toMatchObject({ confirmado: true, partido: { estado: 'rival_confirmado' } });
    expect((await api().post(`/api/partidos/${p.id}/postulaciones`).set(capC.auth).send({ equipoId: equipoC }).expect(409)).body.error.codigo).toBe('PARTIDO_CERRADO');
  });

  it('RN-11: un equipo con partido a la misma hora no se puede postular', async () => {
    const fecha = proximoDia(3);
    const p = await publicarRival();
    const cancha2 = (await api().post(`/api/complejos/${complejoId}/canchas`).set(admin.auth).send({ nombre: 'Cancha 2', tipoFutbol: 5, superficie: 'S' }).expect(201)).body.cancha.id;
    await api().post(`/api/canchas/${cancha2}/tarifas`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '08:00', horaFin: '23:00', precio: 80000 }).expect(201);
    const propia = await reservaConfirmada(capB, fecha, '18:00', cancha2);
    await api().post('/api/partidos').set(capB.auth).send({ modalidad: 'busco_rival', reservaId: propia, equipoId: equipoB, nivelBuscado: 'intermedio' }).expect(201);
    expect((await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(409)).body.error.codigo).toBe('CRUCE_DE_HORARIO');
  });

  it('un equipo no juega contra sí mismo, no se postula dos veces y puede retirarse y volver', async () => {
    const p = await publicarRival();
    expect((await api().post(`/api/partidos/${p.id}/postulaciones`).set(capA.auth).send({ equipoId: equipoA }).expect(409)).body.error.codigo).toBe('MISMO_EQUIPO');
    const a = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    expect((await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(409)).body.error.codigo).toBe('YA_POSTULADO');
    await api().delete(`/api/postulaciones/${a.body.postulacionId}`).set(capA.auth).expect(403);
    await api().delete(`/api/postulaciones/${a.body.postulacionId}`).set(capB.auth).expect(204);
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
  });

  it('RN-10: aceptar a dos rivales a la vez: solo uno queda confirmado', async () => {
    const capC = await crearUsuario();
    const equipoC = await crearEquipo(capC, 'Equipo C');
    const p = await publicarRival();
    const a = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    const b = await api().post(`/api/partidos/${p.id}/postulaciones`).set(capC.auth).send({ equipoId: equipoC }).expect(201);
    const r = await aLaVez(p.id, [a, b].map((x) => () => api().post(`/api/postulaciones/${x.body.postulacionId}/respuesta`).set(capA.auth).send({ aceptar: true })));
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(await query("SELECT 1 FROM postulacion_rival WHERE estado = 'aceptada'")).toHaveLength(1);
  });
});

describe('HU-22.4 · busco partido sin cancha', () => {
  const pedir = (fecha: string) =>
    api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_partido_sin_cancha', equipoId: equipoA, nivelBuscado: 'intermedio', fechaPreferida: fecha, rangoHoraInicio: '17:00', rangoHoraFin: '21:00', zona: 'Cali sur' }).expect(201);

  it('otro equipo con reserva dentro del rango lo acepta y queda confirmado', async () => {
    const fecha = proximoDia(3);
    const { body } = await pedir(fecha);
    expect(body.partido).toMatchObject({ reserva: null, zona: 'Cali sur', estado: 'buscando' });
    expect((await api().get('/api/partidos?ciudad=cali')).body.partidos).toHaveLength(1);
    const reservaId = await reservaConfirmada(capB, fecha, '18:00');
    const r = await api().post(`/api/partidos/${body.partido.id}/aceptar-con-reserva`).set(capB.auth).send({ equipoId: equipoB, reservaId }).expect(200);
    expect(r.body.partido).toMatchObject({ estado: 'rival_confirmado', equipoRival: { id: equipoB }, reserva: { id: reservaId } });
  });

  it('409 si la reserva no cae en lo pedido; las demás modalidades no aplican', async () => {
    const fecha = proximoDia(3);
    const { body } = await pedir(fecha);
    const fuera = await reservaConfirmada(capB, fecha, '09:00');
    expect((await api().post(`/api/partidos/${body.partido.id}/aceptar-con-reserva`).set(capB.auth).send({ equipoId: equipoB, reservaId: fuera }).expect(409)).body.error.codigo).toBe('RESERVA_FUERA_DE_RANGO');
    const p = await publicarRival();
    expect((await api().post(`/api/partidos/${p.id}/aceptar-con-reserva`).set(capB.auth).send({ equipoId: equipoB, reservaId: fuera }).expect(409)).body.error.codigo).toBe('MODALIDAD_INVALIDA');
  });
});

describe('HU-25 · faltan jugadores', () => {
  it('muestra cupos y aporte; al aceptar disminuyen y con el último se cierra', async () => {
    const p = await publicarFaltan(2, 12000);
    const j1 = await crearUsuario();
    const j2 = await crearUsuario();
    const j3 = await crearUsuario();
    const i1 = await api().post(`/api/partidos/${p.id}/inscripciones`).set(j1.auth).send({ posicion: 'arquero' }).expect(201);
    expect(i1.body.inscripcion).toMatchObject({ estado: 'pendiente', aporte: 12000, posicion: 'arquero' });
    const i2 = await api().post(`/api/partidos/${p.id}/inscripciones`).set(j2.auth).send({}).expect(201);
    await api().post(`/api/partidos/${p.id}/inscripciones`).set(j3.auth).send({}).expect(201);
    await api().get(`/api/partidos/${p.id}/inscripciones`).set(j1.auth).expect(403);

    const r1 = await api().post(`/api/inscripciones/${i1.body.inscripcion.id}/respuesta`).set(capA.auth).send({ aceptar: true }).expect(200);
    expect(r1.body.partido).toMatchObject({ cuposDisponibles: 1, estado: 'buscando' });
    const r2 = await api().post(`/api/inscripciones/${i2.body.inscripcion.id}/respuesta`).set(capA.auth).send({ aceptar: true }).expect(200);
    expect(r2.body.partido).toMatchObject({ cuposDisponibles: 0, estado: 'completo' });
    const lista = await api().get(`/api/partidos/${p.id}/inscripciones`).set(capA.auth).expect(200);
    expect(lista.body.inscripciones.map((x: { estado: string }) => x.estado)).toEqual(['aceptada', 'aceptada', 'rechazada']);
    expect(JSON.stringify(lista.body)).not.toMatch(/correo|celular/);
  });

  it('RN-10: los cupos no superan la modalidad', async () => {
    const reservaId = await reservaConfirmada(capA);
    await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'faltan_jugadores', reservaId, equipoId: equipoA, nivelBuscado: 'intermedio', cuposDisponibles: 11 }).expect(400);
  });

  it('un miembro del equipo no pide cupo; nadie se inscribe dos veces', async () => {
    const p = await publicarFaltan();
    expect((await api().post(`/api/partidos/${p.id}/inscripciones`).set(capA.auth).send({}).expect(409)).body.error.codigo).toBe('YA_ES_MIEMBRO');
    const j = await crearUsuario();
    await api().post(`/api/partidos/${p.id}/inscripciones`).set(j.auth).send({}).expect(201);
    expect((await api().post(`/api/partidos/${p.id}/inscripciones`).set(j.auth).send({}).expect(409)).body.error.codigo).toBe('YA_INSCRITO');
  });

  it('dos aceptaciones simultáneas con un cupo: solo una entra', async () => {
    const p = await publicarFaltan(1);
    const [a, b] = await Promise.all([crearUsuario(), crearUsuario()]);
    const ia = await api().post(`/api/partidos/${p.id}/inscripciones`).set(a.auth).send({}).expect(201);
    const ib = await api().post(`/api/partidos/${p.id}/inscripciones`).set(b.auth).send({}).expect(201);
    const r = await aLaVez(p.id, [ia, ib].map((x) => () => api().post(`/api/inscripciones/${x.body.inscripcion.id}/respuesta`).set(capA.auth).send({ aceptar: true })));
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(await query("SELECT 1 FROM inscripcion_jugador WHERE estado = 'aceptada'")).toHaveLength(1);
  });

  it('dos aceptaciones simultáneas con dos cupos: ambas cuentan (sin actualización perdida)', async () => {
    const p = await publicarFaltan(2);
    const [a, b] = await Promise.all([crearUsuario(), crearUsuario()]);
    const ia = await api().post(`/api/partidos/${p.id}/inscripciones`).set(a.auth).send({}).expect(201);
    const ib = await api().post(`/api/partidos/${p.id}/inscripciones`).set(b.auth).send({}).expect(201);
    const r = await aLaVez(p.id, [ia, ib].map((x) => () => api().post(`/api/inscripciones/${x.body.inscripcion.id}/respuesta`).set(capA.auth).send({ aceptar: true })));
    expect(r.map((x) => x.status)).toEqual([200, 200]);
    expect((await api().get(`/api/partidos/${p.id}`)).body.partido).toMatchObject({ cuposDisponibles: 0, estado: 'completo' });
  });

  it('retirarse de un cupo aceptado lo libera y reabre el anuncio', async () => {
    const p = await publicarFaltan(1);
    const j = await crearUsuario();
    const i = await api().post(`/api/partidos/${p.id}/inscripciones`).set(j.auth).send({}).expect(201);
    await api().post(`/api/inscripciones/${i.body.inscripcion.id}/respuesta`).set(capA.auth).send({ aceptar: true }).expect(200);
    await api().delete(`/api/inscripciones/${i.body.inscripcion.id}`).set(capB.auth).expect(404);
    await api().delete(`/api/inscripciones/${i.body.inscripcion.id}`).set(j.auth).expect(204);
    expect((await api().get(`/api/partidos/${p.id}`)).body.partido).toMatchObject({ cuposDisponibles: 1, estado: 'buscando' });
  });
});
