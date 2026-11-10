/**
 * Regresiones de la revisión independiente del Sprint 4: dinero del rival durante el cobro, carreras con
 * la anulación por plazo, doble envío, abono perdido (HU-26.3), avisos en "sin cancha" y RN-08.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pasarelaDePagos } from '../../src/infrastructure/payments';
import { matchmakingApi } from '../../src/modules/matchmaking';
import { matchmakingService } from '../../src/modules/matchmaking/matchmaking.service';
import { paymentsService } from '../../src/modules/payments/payments.service';
import type { UsuarioSesion } from '../../src/shared/middleware/authenticate';
import { instanteBogota } from '../../src/shared/utils/time';
import { api, crearComplejoActivo, crearUsuario, limpiarBd, pagarAbono, pool, proximoDia, query, queryOne, reservar, type UsuarioPrueba } from '../helpers/api';

let admin: UsuarioPrueba;
let capA: UsuarioPrueba;
let capB: UsuarioPrueba;
let canchaId: number;
let equipoA: number;
let equipoB: number;

const TARJETA = { metodo: 'tarjeta', datos: { numeroTarjeta: '4242 4242 4242 4242' } } as const;
const sesion = (u: UsuarioPrueba) => ({ id: u.id, rol: 'Jugador', estado: 'activo', correoVerificado: true, nombres: 'Prueba', correo: u.correo }) as UsuarioSesion;
const FECHA = () => proximoDia(3, 3);
const TRES_HORAS = 3 * 3_600_000;

const crearEquipo = async (u: UsuarioPrueba, nombre: string) =>
  (await api().post('/api/equipos').set(u.auth).send({ nombre, nivel: 'intermedio', tipoFutbol: 5 }).expect(201)).body.equipo.id as number;

async function conRival(hora = '18:00') {
  const r = await reservar(capA, canchaId, FECHA(), hora);
  await pagarAbono(capA, r.id);
  const p = await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: r.id, equipoId: equipoA, nivelBuscado: 'intermedio', aceptacionAutomatica: true }).expect(201);
  await api().post(`/api/partidos/${p.body.partido.id}/postulaciones`).set(capB.auth).send({ equipoId: equipoB }).expect(201);
  return { id: p.body.partido.id as number, reservaId: r.id };
}

const notifs = async (u: UsuarioPrueba) =>
  (await api().get('/api/notificaciones?tamano=50').set(u.auth).expect(200)).body.notificaciones as { tipo: string; titulo: string; mensaje: string }[];
const pagosAprobadosDe = (usuarioId: number) =>
  query<{ id: number; valor: number; equipo_id: number | null }>("SELECT id, valor::int AS valor, equipo_id FROM pago WHERE usuario_id = $1 AND estado = 'aprobado' ORDER BY id", [usuarioId]);
const reembolsadoDe = async (pagoId: number) => (await queryOne<{ s: number }>('SELECT COALESCE(sum(valor), 0)::int AS s FROM reembolso WHERE pago_id = $1', [pagoId]))!.s;

beforeEach(async () => {
  await limpiarBd();
  admin = await crearUsuario();
  capA = await crearUsuario({ username: 'capitan_a', correo: 'a@prueba.co' });
  capB = await crearUsuario({ username: 'capitan_b', correo: 'b@prueba.co' });
  ({ canchaId } = await crearComplejoActivo(admin));
  equipoA = await crearEquipo(capA, 'Equipo A');
  equipoB = await crearEquipo(capB, 'Equipo B');
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

describe('R1 · pago del rival en curso cuando pierde la confirmación', () => {
  /** El cobro del rival está en la pasarela (pago "pendiente") y, mientras tanto, se le anula o se retira. */
  async function pagoInterrumpidoPor(interrupcion: (partidoId: number) => Promise<unknown>) {
    const p = await conRival();
    const original = pasarelaDePagos.cobrar.bind(pasarelaDePagos);
    vi.spyOn(pasarelaDePagos, 'cobrar').mockImplementationOnce(async (s) => {
      await interrupcion(p.id);
      return original(s);
    });
    const res = await api().post(`/api/partidos/${p.id}/pago-rival`).set(capB.auth).send(TARJETA);
    const [pago] = await pagosAprobadosDe(capB.id);
    return { p, res, pago: pago!, reserva: (await queryOne<{ saldo: number }>('SELECT saldo_pendiente::int AS saldo FROM reserva WHERE id = $1', [p.reservaId]))! };
  }

  it('R1a: mientras el cobro sigue en la pasarela, la tarea no anula al rival; el pago cuenta', async () => {
    const { p, res, pago } = await pagoInterrumpidoPor(() => matchmakingApi.anularRivalesMorosos(new Date(Date.now() + TRES_HORAS)));
    expect(res.status).toBe(201);
    expect(pago.valor).toBeGreaterThan(0);
    expect(await reembolsadoDe(pago.id)).toBe(0);
    expect((await api().get(`/api/partidos/${p.id}`).expect(200)).body.partido.estado).toBe('rival_confirmado');
  });

  it('R1b: retirarse (HU-26.3, > 24 h → 100 %) durante el cobro deja el dinero del rival sin reembolso', async () => {
    const { pago } = await pagoInterrumpidoPor((id) => matchmakingService.retirarRival(id, sesion(capB)));
    expect(pago.valor).toBeGreaterThan(0);
    expect(await reembolsadoDe(pago.id)).toBe(pago.valor);
  });
});

describe('R1c · el pago se aprueba entre la verificación y la anulación', () => {
  it('un rival que pagó dentro del plazo pierde la confirmación igual', async () => {
    const p = await conRival();
    const original = paymentsService.pagadoPorEquipo.bind(paymentsService);
    let llamadas = 0;
    vi.spyOn(paymentsService, 'pagadoPorEquipo').mockImplementation(async (...args) => {
      const v = await original(...args);
      // La tarea leyó "no ha pagado"; justo después el capitán paga (aún dentro de su plazo real).
      if (++llamadas === 1) await matchmakingService.pagarParteRival(p.id, sesion(capB), { ...TARJETA });
      return v;
    });
    await matchmakingApi.anularRivalesMorosos(new Date(Date.now() + TRES_HORAS));
    vi.restoreAllMocks();
    expect((await pagosAprobadosDe(capB.id)).length).toBe(1);
    expect((await api().get(`/api/partidos/${p.id}`).expect(200)).body.partido.estado).toBe('rival_confirmado');
  });
});

describe('R2 · doble envío del pago del rival', () => {
  it('dos pagos casi simultáneos superan la parte del equipo (la validación ocurre fuera del bloqueo)', async () => {
    const p = await conRival();
    const resumen = (await api().get(`/api/partidos/${p.id}/resumen-pago`).set(capB.auth).expect(200)).body;
    const parte: number = resumen.equipoRival.parte;

    // Simula latencia en la primera petición entre la lectura de "pagado" y el registro del pago.
    const original = paymentsService.pagadoPorEquipo.bind(paymentsService);
    let llamadas = 0;
    let liberar!: () => void;
    const compuerta = new Promise<void>((r) => (liberar = r));
    vi.spyOn(paymentsService, 'pagadoPorEquipo').mockImplementation(async (...args) => {
      const v = await original(...args);
      if (++llamadas === 1) await compuerta;
      return v;
    });

    const primera = matchmakingService.pagarParteRival(p.id, sesion(capB), { ...TARJETA, valor: parte });
    while (llamadas < 1) await new Promise((r) => setTimeout(r, 5));
    await matchmakingService.pagarParteRival(p.id, sesion(capB), { ...TARJETA, valor: parte });
    liberar();
    await primera.catch(() => undefined);

    const pagado = (await pagosAprobadosDe(capB.id)).reduce((s, x) => s + x.valor, 0);
    expect(pagado).toBeLessThanOrEqual(parte);
  });
});

describe('R2b · con el abono ya pagado, dos pagos simultáneos del resto no superan la parte', () => {
  it('el segundo se rechaza bajo el bloqueo de la reserva', async () => {
    const p = await conRival();
    await api().post(`/api/partidos/${p.id}/pago-rival`).set(capB.auth).send(TARJETA).expect(201);
    const { parte, abono } = (await api().get(`/api/partidos/${p.id}/resumen-pago`).set(capB.auth).expect(200)).body.equipoRival as { parte: number; abono: number };
    const resto = parte - abono;
    const original = paymentsService.pagadoPorEquipo.bind(paymentsService);
    let llamadas = 0;
    let liberar!: () => void;
    const compuerta = new Promise<void>((r) => (liberar = r));
    vi.spyOn(paymentsService, 'pagadoPorEquipo').mockImplementation(async (...args) => {
      const v = await original(...args);
      if (++llamadas === 1) await compuerta;
      return v;
    });
    const primera = matchmakingService.pagarParteRival(p.id, sesion(capB), { ...TARJETA, valor: resto });
    while (llamadas < 1) await new Promise((r) => setTimeout(r, 5));
    // La otra petición paga casi todo el resto: la parte aún no está completa, pero ya no cabe la primera.
    await matchmakingService.pagarParteRival(p.id, sesion(capB), { ...TARJETA, valor: resto - 1000 });
    liberar();
    await expect(primera).rejects.toMatchObject({ status: 400 });
    expect((await pagosAprobadosDe(capB.id)).reduce((s, x) => s + x.valor, 0)).toBe(parte - 1000);
  });
});

describe('R3 · "busco partido sin cancha": el deudor es el publicador, pero los avisos van al revés', () => {
  async function sinCanchaConfirmado() {
    const fecha = FECHA();
    const pub = await api().post('/api/partidos').set(capA.auth)
      .send({ modalidad: 'busco_partido_sin_cancha', equipoId: equipoA, nivelBuscado: 'intermedio', fechaPreferida: fecha, rangoHoraInicio: '17:00', rangoHoraFin: '21:00', zona: 'Laureles' })
      .expect(201);
    const r = await reservar(capB, canchaId, fecha, '18:00');
    await pagarAbono(capB, r.id);
    await api().post(`/api/partidos/${pub.body.partido.id}/aceptar-con-reserva`).set(capB.auth).send({ equipoId: equipoB, reservaId: r.id }).expect(200);
    // Quien debe pagar es el publicador (A): solo A puede pagar.
    await api().post(`/api/partidos/${pub.body.partido.id}/pago-rival`).set(capB.auth).send(TARJETA).expect(403);
    return pub.body.partido.id as number;
  }

  it('R3a: al confirmar, el aviso "Paguen su abono" le llega al equipo con cancha y no al que debe pagar', async () => {
    await sinCanchaConfirmado();
    const pideAbono = (n: { tipo: string; mensaje: string }) => n.tipo === 'rival_confirmado' && n.mensaje.includes('Paguen su abono');
    expect((await notifs(capB)).filter(pideAbono)).toHaveLength(0);
    expect((await notifs(capA)).filter(pideAbono)).toHaveLength(1);
  });

  it('R3b: al anular por no pagar, se culpa al equipo con cancha ("No pagaron su abono a tiempo")', async () => {
    await sinCanchaConfirmado();
    expect(await matchmakingApi.anularRivalesMorosos(new Date(Date.now() + TRES_HORAS))).toBe(1);
    const culpa = (n: { tipo: string; titulo: string }) => n.tipo === 'rival_anulado' && n.titulo === 'Perdieron la confirmación';
    expect((await notifs(capB)).filter(culpa)).toHaveLength(0);
    expect((await notifs(capA)).filter(culpa)).toHaveLength(1);
  });
});

describe('R5 · HU-26.3: el abono perdido por retiro tardío vuelve al equipo que lo perdió', () => {
  it('cuando un nuevo rival paga su parte, el "excedente" se reembolsa al pago perdido del rival anterior', async () => {
    const p = await conRival();
    await api().post(`/api/partidos/${p.id}/pago-rival`).set(capB.auth).send(TARJETA).expect(201);
    const [pagoPerdido] = await pagosAprobadosDe(capB.id);
    // Se retira 3 horas antes: pierde el 100 % del abono (RN-05) y recibe la marca.
    const ahora = new Date(instanteBogota(FECHA(), '18:00').getTime() - TRES_HORAS);
    expect(await matchmakingService.retirarRival(p.id, sesion(capB), ahora)).toMatchObject({ porcentajeReembolso: 0, cancelacionTardia: true });

    const capC = await crearUsuario({ username: 'capitan_c', correo: 'c@prueba.co' });
    const equipoC = await crearEquipo(capC, 'Equipo C');
    await api().post(`/api/partidos/${p.id}/postulaciones`).set(capC.auth).send({ equipoId: equipoC }).expect(201);
    const parte = (await api().get(`/api/partidos/${p.id}/resumen-pago`).set(capC.auth).expect(200)).body.equipoRival.parte as number;
    await api().post(`/api/partidos/${p.id}/pago-rival`).set(capC.auth).send({ ...TARJETA, valor: parte }).expect(201);

    // El abono perdido no debe devolverse al equipo que se retiró tarde.
    expect(await reembolsadoDe(pagoPerdido!.id)).toBe(0);
  });
});

describe('R4 · HU-12.4: avisa también a quien canceló', () => {
  it('el capitán que cancela su propia reserva recibe "Partido cancelado" (y su correo)', async () => {
    const p = await conRival();
    await api().post(`/api/reservas/${p.reservaId}/cancelar`).set(capA.auth).send({}).expect(200);
    expect((await notifs(capA)).filter((n) => n.tipo === 'partido_cancelado')).toHaveLength(0);
  });
});

describe('R5b · el abono perdido no se devuelve si el dueño cancela o reprograma', () => {
  async function conAbonoPerdido() {
    const p = await conRival();
    await api().post(`/api/partidos/${p.id}/pago-rival`).set(capB.auth).send(TARJETA).expect(201);
    const [perdido] = await pagosAprobadosDe(capB.id);
    await matchmakingService.retirarRival(p.id, sesion(capB), new Date(instanteBogota(FECHA(), '18:00').getTime() - TRES_HORAS));
    return { p, perdido: perdido! };
  }

  it('al cancelar el dueño, el abono perdido no se reembolsa', async () => {
    const { p, perdido } = await conAbonoPerdido();
    await api().post(`/api/reservas/${p.reservaId}/cancelar`).set(capA.auth).send({}).expect(200);
    expect(await reembolsadoDe(perdido.id)).toBe(0);
  });

  it('si cancela el complejo, se devuelve todo, también lo perdido', async () => {
    const { p, perdido } = await conAbonoPerdido();
    await api().post(`/api/reservas/${p.reservaId}/cancelar`).set(admin.auth).send({ motivo: 'Daño en la cancha' }).expect(200);
    expect(await reembolsadoDe(perdido.id)).toBe(perdido.valor);
  });

  it('al reprogramar, el abono perdido se traslada con la reserva y no se reembolsa', async () => {
    const { p, perdido } = await conAbonoPerdido();
    const r = await api().post(`/api/reservas/${p.reservaId}/reprogramar`).set(capA.auth).send({ fecha: proximoDia(4, 3), horaInicio: '19:00' }).expect(200);
    expect(await reembolsadoDe(perdido.id)).toBe(0);
    expect((await queryOne<{ reserva_id: number }>('SELECT reserva_id FROM pago WHERE id = $1', [perdido.id]))!.reserva_id).toBe(r.body.reserva.id);
  });
});

describe('R6 · RN-08: lo que ya causó una suspensión no vuelve a contar', () => {
  it('tras cumplir la suspensión, una nueva inasistencia no suspende otra vez', async () => {
    const ids: number[] = [];
    for (const hora of ['10:00', '11:00', '12:00', '13:00']) {
      const r = await reservar(capA, canchaId, FECHA(), hora);
      await pagarAbono(capA, r.id);
      ids.push((await api().post('/api/partidos').set(capA.auth).send({ modalidad: 'busco_rival', reservaId: r.id, equipoId: equipoA, nivelBuscado: 'intermedio' }).expect(201)).body.partido.id);
    }
    for (const id of ids.slice(0, 3)) await matchmakingApi.registrarInasistencia(equipoB, id);
    expect((await queryOne<{ s: Date | null }>('SELECT suspendido_hasta AS s FROM equipo WHERE id = $1', [equipoB]))!.s).not.toBeNull();
    await matchmakingApi.levantarSuspensiones(new Date(Date.now() + 16 * 86_400_000));
    await matchmakingApi.registrarInasistencia(equipoB, ids[3]!);
    const e = (await queryOne<{ s: Date | null; n: number }>('SELECT suspendido_hasta AS s, inasistencias AS n FROM equipo WHERE id = $1', [equipoB]))!;
    expect(e.n).toBe(4); // el historial completo se conserva
    expect(e.s).toBeNull();
  });
});
