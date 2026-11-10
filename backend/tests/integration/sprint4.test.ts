/** Sprint 4: pago dividido (HU-26), notificaciones (HU-28, HU-29), calificaciones (HU-30, HU-31) y RN-07/RN-08. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordatoriosJob } from '../../src/jobs/recordatorios.job';
import { matchmakingApi } from '../../src/modules/matchmaking';
import { matchmakingService } from '../../src/modules/matchmaking/matchmaking.service';
import { ratingsApi } from '../../src/modules/ratings';
import type { UsuarioSesion } from '../../src/shared/middleware/authenticate';
import { instanteBogota } from '../../src/shared/utils/time';
import { api, correos, crearComplejoActivo, crearUsuario, limpiarBd, pagarAbono, pool, proximoDia, query, queryOne, reservar, type UsuarioPrueba } from '../helpers/api';

let admin: UsuarioPrueba;
let capA: UsuarioPrueba;
let capB: UsuarioPrueba;
let complejoId: number;
let canchaId: number;
let equipoA: number;
let equipoB: number;

const TARJETA = { metodo: 'tarjeta', datos: { numeroTarjeta: '4242 4242 4242 4242' } };
const sesion = (u: UsuarioPrueba) => ({ id: u.id, rol: 'Jugador', estado: 'activo', correoVerificado: true, nombres: 'Prueba' }) as UsuarioSesion;
// Siempre con más de 24 horas de anticipación, sea la hora que sea.
const FECHA = () => proximoDia(3, 3);

const crearEquipo = async (u: UsuarioPrueba, nombre: string) =>
  (await api().post('/api/equipos').set(u.auth).send({ nombre, nivel: 'intermedio', tipoFutbol: 5 }).expect(201)).body.equipo.id as number;

async function publicar(hora = '18:00', extra: Record<string, unknown> = {}) {
  const r = await reservar(capA, canchaId, FECHA(), hora);
  await pagarAbono(capA, r.id);
  const p = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: r.id, equipoId: equipoA, nivelBuscado: 'intermedio', aceptacionAutomatica: true, ...extra }).expect(201);
  return { id: p.body.partido.id as number, reservaId: r.id };
}

async function conRival(hora = '18:00', extra: Record<string, unknown> = {}) {
  const p = await publicar(hora, extra);
  await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
  return p;
}

const yaOcurrio = (id: number) => query('UPDATE reserva SET fecha = fecha - 21 WHERE id = $1', [id]);
const completar = async (reservaId: number) => {
  await yaOcurrio(reservaId);
  await api().patch(`/api/reservas/${reservaId}/estado`).set(admin.auth).send({ estado: 'completada' }).expect(200);
};
async function jugado(hora = '18:00') {
  const p = await conRival(hora);
  await completar(p.reservaId);
  return p;
}

const estadoPartido = async (id: number) => (await api().get(`/api/partidos/${id}`).expect(200)).body.partido.estado as string;
const notificaciones = async (u: UsuarioPrueba) => (await api().get('/api/notificaciones?tamano=50').set(u.auth).expect(200)).body.notificaciones as { id: number; tipo: string; mensaje: string; leida: boolean; referenciaId: number }[];
const deTipo = async (u: UsuarioPrueba, tipo: string) => (await notificaciones(u)).filter((n) => n.tipo === tipo);
const pagosDeEquipo = (equipoId: number) => query<{ id: number; valor: string; reserva_id: number }>("SELECT id, valor, reserva_id FROM pago WHERE equipo_id = $1 AND estado = 'aprobado'", [equipoId]);
const reembolsosDePago = (pagoId: number) => query<{ valor: string; porcentaje: string }>('SELECT valor, porcentaje FROM reembolso WHERE pago_id = $1', [pagoId]);
const resumen = async (partidoId: number, u = capB) => (await api().get(`/api/partidos/${partidoId}/resumen-pago`).set(u.auth).expect(200)).body;
const pagarRival = (partidoId: number, u = capB) => api().post(`/api/partidos/${partidoId}/pago-rival`).set(u.auth).send(TARJETA);

beforeEach(async () => {
  await limpiarBd();
  admin = await crearUsuario();
  capA = await crearUsuario({ username: 'capitan_a', correo: 'a@prueba.co' });
  capB = await crearUsuario({ username: 'capitan_b', correo: 'b@prueba.co' });
  ({ complejoId, canchaId } = await crearComplejoActivo(admin));
  equipoA = await crearEquipo(capA, 'Equipo A');
  equipoB = await crearEquipo(capB, 'Equipo B');
});
afterAll(() => pool.end());

describe('HU-26 · pago dividido', () => {
  it('divide 50/50 y el rival paga su abono sin duplicar la reserva', async () => {
    const p = await conRival();
    const antes = await resumen(p.id);
    expect(antes.equipoRival.equipoId).toBe(equipoB);
    expect(antes.equipoRival.parte).toBe(antes.precioTotal / 2);
    expect(antes.equipoRival.pagado).toBe(0);
    expect(antes.equipoRival.limitePago).toBeTruthy();
    await pagarRival(p.id).expect(201);
    const despues = await resumen(p.id);
    expect(despues.equipoRival.pagado).toBe(antes.equipoRival.abono);
    expect(despues.totalPagado).toBe(antes.totalPagado + antes.equipoRival.abono);
    expect(despues.saldoPendiente).toBe(antes.saldoPendiente - antes.equipoRival.abono);
  });

  it('respeta el porcentaje acordado al publicar', async () => {
    const p = await conRival('18:00', { porcentajePagoRival: 25 });
    const r = await resumen(p.id);
    expect(r.equipoRival.parte).toBe(r.precioTotal / 4);
    expect(r.equipoDueno.parte).toBe((r.precioTotal * 3) / 4);
  });

  it('solo paga el capitán del equipo que debe, y no más de su parte', async () => {
    const p = await conRival();
    await pagarRival(p.id, capA).expect(403);
    const r = await resumen(p.id);
    await api().post(`/api/partidos/${p.id}/pago-rival`).set(capB.auth).send({ ...TARJETA, valor: r.equipoRival.parte + 1000 }).expect(400);
    await api().post(`/api/partidos/${p.id}/pago-rival`).set(capB.auth).send({ ...TARJETA, valor: 1000 }).expect(400);
  });

  it('un tercero no ve el resumen', async () => {
    const p = await conRival();
    const otro = await crearUsuario();
    await api().get(`/api/partidos/${p.id}/resumen-pago`).set(otro.auth).expect(403);
  });

  it('HU-26.2: sin pago en 2 horas la confirmación se anula y avisa a los dos', async () => {
    const p = await conRival();
    expect(await matchmakingApi.anularRivalesMorosos(new Date())).toBe(0);
    expect(await estadoPartido(p.id)).toBe('rival_confirmado');
    expect(await matchmakingApi.anularRivalesMorosos(new Date(Date.now() + 2.1 * 3_600_000))).toBe(1);
    expect(await estadoPartido(p.id)).toBe('buscando');
    expect(await deTipo(capA, 'rival_anulado')).toHaveLength(1);
    expect(await deTipo(capB, 'rival_anulado')).toHaveLength(1);
  });

  it('HU-26.2: quien pagó su abono conserva la confirmación', async () => {
    const p = await conRival();
    await pagarRival(p.id).expect(201);
    expect(await matchmakingApi.anularRivalesMorosos(new Date(Date.now() + 3 * 3_600_000))).toBe(0);
    expect(await estadoPartido(p.id)).toBe('rival_confirmado');
  });

  it('HU-26.3: retirarse con menos de 6 horas pierde el abono y marca cancelación tardía', async () => {
    const p = await conRival();
    await pagarRival(p.id).expect(201);
    const ahora = new Date(instanteBogota(FECHA(), '18:00').getTime() - 3 * 3_600_000);
    const r = await matchmakingService.retirarRival(p.id, sesion(capB), ahora);
    expect(r).toEqual({ porcentajeReembolso: 0, valorReembolso: 0, cancelacionTardia: true });
    expect(await estadoPartido(p.id)).toBe('buscando');
    expect((await queryOne<{ n: number }>('SELECT cancelaciones_tardias AS n FROM equipo WHERE id = $1', [equipoB]))!.n).toBe(1);
    expect(await deTipo(capA, 'rival_retirado')).toHaveLength(1);
  });

  it('retirarse con más de 24 horas devuelve todo y no deja marca', async () => {
    const p = await conRival();
    await pagarRival(p.id).expect(201);
    const { abono } = (await resumen(p.id)).equipoRival;
    const r = (await api().post(`/api/partidos/${p.id}/retirar-rival`).set(capB.auth).expect(200)).body;
    expect(r).toEqual({ porcentajeReembolso: 100, valorReembolso: abono, cancelacionTardia: false });
    expect((await queryOne<{ n: number }>('SELECT cancelaciones_tardias AS n FROM equipo WHERE id = $1', [equipoB]))!.n).toBe(0);
  });

  it('solo el capitán del rival puede retirarlo', async () => {
    const p = await conRival();
    await api().post(`/api/partidos/${p.id}/retirar-rival`).set(capA.auth).expect(403);
    expect(await estadoPartido(p.id)).toBe('rival_confirmado');
  });
});

describe('Dueño de la reserva con rival confirmado (HU-12.4)', () => {
  it('el preview advierte, y al cancelar el rival recupera el 100 % y recibe aviso', async () => {
    const p = await conRival();
    await pagarRival(p.id).expect(201);
    const preview = (await api().get(`/api/reservas/${p.reservaId}/cancelacion`).set(capA.auth).expect(200)).body;
    expect(preview.partidoAfectado).toEqual({ id: p.id, estado: 'rival_confirmado', equipoRival: 'Equipo B' });
    await api().post(`/api/reservas/${p.reservaId}/cancelar`).set(capA.auth).send({}).expect(200);
    const [pago] = await pagosDeEquipo(equipoB);
    const reembolsos = await reembolsosDePago(pago!.id);
    expect(reembolsos).toHaveLength(1);
    expect(Number(reembolsos[0]!.valor)).toBe(Number(pago!.valor));
    expect(Number(reembolsos[0]!.porcentaje)).toBe(100);
    expect(await deTipo(capB, 'partido_cancelado')).toHaveLength(1);
    expect(correos.ultimoPara(capB.correo)?.asunto).toBe('CanchaYa · Partido cancelado');
    expect(await estadoPartido(p.id)).toBe('cancelado');
  });

  it('al reprogramar, el pago del rival se devuelve completo y no se traslada', async () => {
    const p = await conRival();
    await pagarRival(p.id).expect(201);
    const r = await api().post(`/api/reservas/${p.reservaId}/reprogramar`).set(capA.auth).send({ fecha: proximoDia(4, 3), horaInicio: '19:00' }).expect(200);
    const [pago] = await pagosDeEquipo(equipoB);
    expect(pago!.reserva_id).toBe(p.reservaId);
    expect(Number((await reembolsosDePago(pago!.id))[0]!.porcentaje)).toBe(100);
    expect(r.body.reserva.id).not.toBe(p.reservaId);
    expect(await deTipo(capB, 'partido_cancelado')).toHaveLength(1);
  });
});

describe('HU-28 · notificaciones de reservas', () => {
  const miReserva = async (hora = '10:00', fecha = FECHA()) => {
    const r = await reservar(capA, canchaId, fecha, hora);
    await pagarAbono(capA, r.id);
    return r;
  };

  it('HU-28.1: la confirmación llega a la campana sin duplicar el comprobante por correo', async () => {
    const r = await miReserva();
    const n = await deTipo(capA, 'reserva_confirmada');
    expect(n).toHaveLength(1);
    expect(n[0]!.mensaje).toContain(r.codigo);
    expect(correos.enviados.filter((c) => c.para === capA.correo && c.asunto === 'CanchaYa · Reserva confirmada')).toHaveLength(0);
  });

  it('HU-28.3: si el complejo cancela, llega el motivo en la plataforma y por correo', async () => {
    const r = await miReserva();
    await api().post(`/api/reservas/${r.id}/cancelar`).set(admin.auth).send({ motivo: 'Mantenimiento de la cancha' }).expect(200);
    const [n] = await deTipo(capA, 'reserva_cancelada');
    expect(n!.mensaje).toContain('Mantenimiento de la cancha');
    expect(correos.ultimoPara(capA.correo)?.texto).toContain('Mantenimiento de la cancha');
  });

  it('HU-28.3: si el complejo mueve la reserva, avisa con el motivo y no cobra de más', async () => {
    const r = await miReserva('10:00'); // tarifa diurna
    await api().post(`/api/reservas/${r.id}/reprogramar`).set(admin.auth).send({ fecha: FECHA(), horaInicio: '19:00' }).expect(400);
    const m = await api().post(`/api/reservas/${r.id}/reprogramar`).set(admin.auth).send({ fecha: FECHA(), horaInicio: '19:00', motivo: 'Torneo interno' }).expect(200);
    expect(m.body.reserva.precioTotal).toBe(r.precioTotal); // la franja nocturna cuesta más, pero lo decidió el complejo
    expect(m.body.reserva.usuarioId).toBe(capA.id);
    const [n] = await deTipo(capA, 'reserva_movida');
    expect(n!.mensaje).toContain('Torneo interno');
    expect(n!.referenciaId).toBe(m.body.reserva.id);
  });

  it('un administrador ajeno no puede mover la reserva', async () => {
    const r = await miReserva();
    const otro = await crearUsuario();
    await api().post(`/api/reservas/${r.id}/reprogramar`).set(otro.auth).send({ fecha: FECHA(), horaInicio: '19:00', motivo: 'x' }).expect(404);
  });

  it('HU-28.2: el recordatorio llega una sola vez, solo dentro de las 2 horas previas', async () => {
    const r = await miReserva('18:00');
    const inicio = instanteBogota(FECHA(), '18:00').getTime();
    await recordatoriosJob.ejecutar(new Date(inicio - 3 * 3_600_000));
    expect(await deTipo(capA, 'recordatorio_partido')).toHaveLength(0);
    await recordatoriosJob.ejecutar(new Date(inicio - 3_600_000));
    await recordatoriosJob.ejecutar(new Date(inicio - 3_000_000));
    const lista = await deTipo(capA, 'recordatorio_partido');
    expect(lista).toHaveLength(1);
    expect(lista[0]!.referenciaId).toBe(r.id);
    expect(correos.enviados.filter((c) => c.para === capA.correo && c.asunto === 'CanchaYa · Tu partido es pronto')).toHaveLength(1);
  });

  it('HU-28.4: contador, marcar una y marcar todas; solo las propias', async () => {
    await miReserva('10:00');
    await miReserva('11:00');
    const contar = async () => (await api().get('/api/notificaciones/no-leidas').set(capA.auth).expect(200)).body.noLeidas as number;
    expect(await contar()).toBe(2);
    const [primera] = await notificaciones(capA);
    await api().patch(`/api/notificaciones/${primera!.id}/leida`).set(capB.auth).expect(404);
    expect(await contar()).toBe(2);
    await api().patch(`/api/notificaciones/${primera!.id}/leida`).set(capA.auth).expect(204);
    expect(await contar()).toBe(1);
    await api().post('/api/notificaciones/leidas').set(capA.auth).expect(204);
    expect(await contar()).toBe(0);
  });

  it('exige sesión', async () => {
    await api().get('/api/notificaciones').expect(401);
    await api().get('/api/preferencias-alerta').expect(401);
  });
});

describe('HU-29 y HU-22.3 · alertas', () => {
  const pref = { dias: [3], horaInicio: '17:00', horaFin: '22:00', zona: 'medellin' };

  it('avisa una vez a quien coincide y no al que publicó', async () => {
    await api().post('/api/preferencias-alerta').set(capB.auth).send(pref).expect(201);
    await api().post('/api/preferencias-alerta').set(capB.auth).send({ ...pref, zona: null }).expect(201);
    await api().post('/api/preferencias-alerta').set(capA.auth).send(pref).expect(201);
    const lejos = await crearUsuario();
    await api().post('/api/preferencias-alerta').set(lejos.auth).send({ ...pref, zona: 'Cali' }).expect(201);
    const p = await publicar();
    const alertas = await deTipo(capB, 'alerta_partido_compatible');
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.referenciaId).toBe(p.id);
    expect(await deTipo(capA, 'alerta_partido_compatible')).toHaveLength(0);
    expect(await deTipo(lejos, 'alerta_partido_compatible')).toHaveLength(0);
  });

  it('una alerta desactivada no avisa', async () => {
    await api().post('/api/preferencias-alerta').set(capB.auth).send({ ...pref, activa: false }).expect(201);
    await publicar();
    expect(await deTipo(capB, 'alerta_partido_compatible')).toHaveLength(0);
  });

  it('valida la entrada y protege lo ajeno', async () => {
    await api().post('/api/preferencias-alerta').set(capB.auth).send({ ...pref, horaFin: '10:00' }).expect(400);
    await api().post('/api/preferencias-alerta').set(capB.auth).send({ ...pref, dias: [] }).expect(400);
    await api().post('/api/preferencias-alerta').set(capB.auth).send({ ...pref, equipoId: equipoA }).expect(403);
    const c = await api().post('/api/preferencias-alerta').set(capB.auth).send(pref).expect(201);
    await api().delete(`/api/preferencias-alerta/${c.body.preferencia.id}`).set(capA.auth).expect(404);
    await api().put(`/api/preferencias-alerta/${c.body.preferencia.id}`).set(capA.auth).send(pref).expect(404);
    const u = await api().put(`/api/preferencias-alerta/${c.body.preferencia.id}`).set(capB.auth).send({ ...pref, dias: [5, 1, 5] }).expect(200);
    expect(u.body.preferencia.dias).toEqual([1, 5]);
    await api().delete(`/api/preferencias-alerta/${c.body.preferencia.id}`).set(capB.auth).expect(204);
    expect((await api().get('/api/preferencias-alerta').set(capB.auth).expect(200)).body.preferencias).toEqual([]);
  });

  it('HU-29.2: la postulación avisa al capitán que publicó', async () => {
    const p = await publicar('18:00', { aceptacionAutomatica: false });
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    expect(await deTipo(capA, 'postulacion_recibida')).toHaveLength(1);
  });

  it('HU-22.3: faltando 6 horas sin rival, avisa una sola vez', async () => {
    const p = await publicar();
    const inicio = instanteBogota(FECHA(), '18:00').getTime();
    await recordatoriosJob.ejecutar(new Date(inicio - 7 * 3_600_000));
    expect(await deTipo(capA, 'alerta_sin_rival')).toHaveLength(0);
    await recordatoriosJob.ejecutar(new Date(inicio - 5 * 3_600_000));
    await recordatoriosJob.ejecutar(new Date(inicio - 4 * 3_600_000));
    const lista = await deTipo(capA, 'alerta_sin_rival');
    expect(lista).toHaveLength(1);
    expect(lista[0]!.referenciaId).toBe(p.id);
  });
});

describe('HU-30 · calificar el complejo', () => {
  async function completada(u = capA, hora = '10:00') {
    const r = await reservar(u, canchaId, FECHA(), hora);
    await pagarAbono(u, r.id);
    await completar(r.id);
    return r;
  }

  it('solo tras completarse la reserva', async () => {
    const r = await reservar(capA, canchaId, FECHA(), '10:00');
    await pagarAbono(capA, r.id);
    const res = await api().put(`/api/reservas/${r.id}/calificacion`).set(capA.auth).send({ estrellas: 5 }).expect(409);
    expect(res.body.error.codigo).toBe('RESERVA_NO_COMPLETADA');
  });

  it('la segunda vez edita, no duplica', async () => {
    const r = await completada();
    await api().put(`/api/reservas/${r.id}/calificacion`).set(capA.auth).send({ estrellas: 5, comentario: 'Muy buena' }).expect(200);
    await api().put(`/api/reservas/${r.id}/calificacion`).set(capA.auth).send({ estrellas: 2 }).expect(200);
    const filas = await query<{ estrellas: number; comentario: string | null }>('SELECT estrellas, comentario FROM calificacion_complejo');
    expect(filas).toEqual([{ estrellas: 2, comentario: null }]);
  });

  it('solo el dueño de la reserva, de 1 a 5', async () => {
    const r = await completada();
    await api().put(`/api/reservas/${r.id}/calificacion`).set(capB.auth).send({ estrellas: 5 }).expect(404);
    await api().put(`/api/reservas/${r.id}/calificacion`).set(capA.auth).send({ estrellas: 0 }).expect(400);
    await api().put(`/api/reservas/${r.id}/calificacion`).set(capA.auth).send({ estrellas: 6 }).expect(400);
    await api().put(`/api/reservas/${r.id}/calificacion`).set(capA.auth).send({ estrellas: 3.5 }).expect(400);
  });

  it('HU-30.3: el promedio aparece en búsquedas y las reseñas no identifican al autor', async () => {
    await api().put(`/api/reservas/${(await completada(capA, '10:00')).id}/calificacion`).set(capA.auth).send({ estrellas: 5, comentario: 'Excelente' }).expect(200);
    await api().put(`/api/reservas/${(await completada(capB, '11:00')).id}/calificacion`).set(capB.auth).send({ estrellas: 4 }).expect(200);
    const lista = await api().get('/api/complejos').expect(200);
    expect(lista.body.complejos[0].calificacion).toEqual({ promedio: 4.5, total: 2 });
    const detalle = await api().get(`/api/complejos/${complejoId}/calificaciones`).expect(200);
    expect(detalle.body.resumen).toEqual({ promedio: 4.5, total: 2 });
    expect(detalle.body.calificaciones).toHaveLength(2);
    expect(JSON.stringify(detalle.body)).not.toMatch(/usuarioId|reservaId|capitan_|prueba\.co/);
  });

  it('HU-30.3: el promedio también aparece en la búsqueda por disponibilidad', async () => {
    const r = await completada();
    await api().put(`/api/reservas/${r.id}/calificacion`).set(capA.auth).send({ estrellas: 4 }).expect(200);
    const b = await api().get(`/api/disponibilidad?fecha=${FECHA()}`).expect(200);
    expect(b.body.resultados[0].complejo.calificacion).toEqual({ promedio: 4, total: 1 });
  });

  it('el perfil público muestra partidos jugados y no expone contacto', async () => {
    await completada();
    const p = await api().get('/api/usuarios/capitan_a').expect(200);
    expect(JSON.stringify(p.body)).toContain('"partidosJugados":1');
    expect(JSON.stringify(p.body)).not.toMatch(/a@prueba\.co|3001234567/);
  });
});

describe('HU-31 · fair play e inasistencias (RN-07, RN-08, RN-12)', () => {
  const calificar = (partidoId: number, u: UsuarioPrueba, cuerpo: Record<string, unknown>) => api().post(`/api/partidos/${partidoId}/calificaciones`).set(u.auth).send(cuerpo);
  const buena = (equipoId: number) => ({ noSePresento: false, equipoId, puntualidad: 4, fairPlay: 5 });
  const inasistencias = async (id: number) => (await queryOne<{ n: number }>('SELECT inasistencias AS n FROM equipo WHERE id = $1', [id]))!.n;

  it('RN-12: cada capitán participante califica una vez un partido jugado', async () => {
    const p = await jugado();
    await calificar(p.id, capA, buena(equipoA)).expect(201);
    const repetida = await calificar(p.id, capA, buena(equipoA)).expect(409);
    expect(repetida.body.error.codigo).toBe('YA_CALIFICADO');
    await calificar(p.id, capB, { ...buena(equipoB), fairPlay: 3 }).expect(201);
    expect((await ratingsApi.fairPlayDeEquipos([equipoA, equipoB])).get(equipoB)).toBe(5);
    expect((await ratingsApi.fairPlayDeEquipos([equipoA, equipoB])).get(equipoA)).toBe(3);
  });

  it('cada capitán consulta solo lo que calificó su equipo', async () => {
    const p = await jugado();
    const mia = async (u: UsuarioPrueba) => (await api().get(`/api/partidos/${p.id}/mi-calificacion`).set(u.auth).expect(200)).body.calificacion;
    expect(await mia(capA)).toBeNull();
    await calificar(p.id, capA, buena(equipoA)).expect(201);
    expect((await mia(capA)).equipoCalificadorId).toBe(equipoA);
    expect(await mia(capB)).toBeNull();
    expect(await mia(await crearUsuario())).toBeNull();
    await api().get(`/api/partidos/${p.id}/mi-calificacion`).expect(401);
  });

  it('dos peticiones simultáneas dejan una sola calificación', async () => {
    const p = await jugado();
    const r = await Promise.all([calificar(p.id, capA, buena(equipoA)), calificar(p.id, capA, buena(equipoA))]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it('rechaza partidos sin jugar, terceros y capitanes ajenos', async () => {
    const p = await conRival();
    await calificar(p.id, capA, buena(equipoA)).expect(409);
    await completar(p.reservaId);
    await calificar(p.id, capB, buena(equipoA)).expect(403);
    const capC = await crearUsuario({ username: 'capitan_c' });
    const equipoC = await crearEquipo(capC, 'Equipo C');
    await calificar(p.id, capC, buena(equipoC)).expect(409);
    await calificar(p.id, capA, { noSePresento: false, equipoId: equipoA, puntualidad: 9, fairPlay: 5 }).expect(400);
  });

  it('HU-31.2: la inasistencia solo cuenta cuando la confirma el complejo, y una vez', async () => {
    const p = await jugado();
    const c = await calificar(p.id, capA, { noSePresento: true, equipoId: equipoA }).expect(201);
    expect(await inasistencias(equipoB)).toBe(0);
    expect(await deTipo(admin, 'inasistencia_reportada')).toHaveLength(1);
    const lista = await api().get(`/api/complejos/${complejoId}/inasistencias-reportadas`).set(admin.auth).expect(200);
    expect(lista.body.reportes.map((x: { id: number }) => x.id)).toEqual([c.body.calificacion.id]);

    const r = await Promise.all([1, 2].map(() => api().post(`/api/calificaciones-equipo/${c.body.calificacion.id}/confirmar-inasistencia`).set(admin.auth)));
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(await inasistencias(equipoB)).toBe(1);
    expect((await api().get(`/api/complejos/${complejoId}/inasistencias-reportadas`).set(admin.auth).expect(200)).body.reportes).toEqual([]);
  });

  it('un jugador o un administrador ajeno no confirma', async () => {
    const p = await jugado();
    const c = await calificar(p.id, capA, { noSePresento: true, equipoId: equipoA }).expect(201);
    const url = `/api/calificaciones-equipo/${c.body.calificacion.id}/confirmar-inasistencia`;
    await api().post(url).set(capA.auth).expect(403);
    const otroAdmin = await crearUsuario();
    await crearComplejoActivo(otroAdmin, { nombre: 'Otro complejo' });
    await api().post(url).set(otroAdmin.auth).expect(404);
    await api().get(`/api/complejos/${complejoId}/inasistencias-reportadas`).set(otroAdmin.auth).expect(403);
    expect(await inasistencias(equipoB)).toBe(0);
  });

  it('RN-07: "no asistió" suma una inasistencia al equipo dueño de la reserva', async () => {
    const p = await conRival();
    await yaOcurrio(p.reservaId);
    await api().patch(`/api/reservas/${p.reservaId}/estado`).set(admin.auth).send({ estado: 'no_asistio' }).expect(200);
    expect(await inasistencias(equipoA)).toBe(1);
    expect(await inasistencias(equipoB)).toBe(0);
  });

  it('RN-08: la tercera inasistencia en 60 días suspende 15 días; luego se levanta', async () => {
    const partidos = [await publicar('10:00'), await publicar('11:00'), await publicar('12:00')];
    await matchmakingApi.registrarInasistencia(equipoB, partidos[0]!.id);
    await matchmakingApi.registrarInasistencia(equipoB, partidos[0]!.id); // idempotente
    await matchmakingApi.registrarInasistencia(equipoB, partidos[1]!.id);
    expect(await inasistencias(equipoB)).toBe(2);
    await api().post(`/api/partidos/${partidos[2]!.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
    await api().post(`/api/partidos/${partidos[2]!.id}/retirar-rival`).set(capB.auth).expect(200);

    await matchmakingApi.registrarInasistencia(equipoB, partidos[2]!.id);
    const { suspendido_hasta: hasta } = (await queryOne<{ suspendido_hasta: Date }>('SELECT suspendido_hasta FROM equipo WHERE id = $1', [equipoB]))!;
    const dias = (hasta.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(14.9);
    expect(dias).toBeLessThan(15.1);
    expect(await deTipo(capB, 'equipo_suspendido')).toHaveLength(1);
    const bloqueada = await api().post(`/api/partidos/${partidos[2]!.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(403);
    expect(bloqueada.body.error.codigo).toBe('EQUIPO_SUSPENDIDO');

    expect(await matchmakingApi.levantarSuspensiones(new Date(Date.now() + 14 * 86_400_000))).toBe(0);
    expect(await matchmakingApi.levantarSuspensiones(new Date(Date.now() + 16 * 86_400_000))).toBe(1);
    expect(await deTipo(capB, 'suspension_levantada')).toHaveLength(1);
  });
});

describe('HU-31.4 · marcador', () => {
  const enviar = (id: number, u: UsuarioPrueba, equipoId: number, golesPublicador: number, golesRival: number) =>
    api().post(`/api/partidos/${id}/marcador`).set(u.auth).send({ equipoId, golesPublicador, golesRival });

  it('queda firme cuando los dos capitanes coinciden', async () => {
    const p = await jugado();
    expect((await enviar(p.id, capA, equipoA, 2, 1).expect(200)).body.confirmado).toBe(false);
    const distinto = await enviar(p.id, capB, equipoB, 2, 2).expect(200);
    expect(distinto.body).toMatchObject({ confirmadoPublicador: false, confirmadoRival: true, confirmado: false });
    expect((await enviar(p.id, capA, equipoA, 2, 2).expect(200)).body.confirmado).toBe(true);
    expect((await enviar(p.id, capA, equipoA, 3, 0).expect(409)).body.error.codigo).toBe('MARCADOR_CONFIRMADO');
  });

  it('queda consultable en el detalle del partido', async () => {
    const p = await jugado();
    const ver = async () => (await api().get(`/api/partidos/${p.id}`).expect(200)).body.marcador;
    expect(await ver()).toBeNull();
    await enviar(p.id, capA, equipoA, 3, 1).expect(200);
    expect(await ver()).toEqual({ golesPublicador: 3, golesRival: 1, confirmadoPublicador: true, confirmadoRival: false, confirmado: false });
    await enviar(p.id, capB, equipoB, 3, 1).expect(200);
    expect((await ver()).confirmado).toBe(true);
  });

  it('solo tras jugar y solo los capitanes participantes', async () => {
    const p = await conRival();
    await enviar(p.id, capA, equipoA, 1, 0).expect(409);
    await completar(p.reservaId);
    await enviar(p.id, capA, equipoB, 1, 0).expect(403);
    await enviar(p.id, capA, equipoA, -1, 0).expect(400);
  });
});
