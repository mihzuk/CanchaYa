/** Pruebas de integración de EP-03: disponibilidad, reservar, reservas del complejo (HU-10 a HU-14, RN-01 a RN-07). */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bookingsApi } from '../../src/modules/bookings';
import { ejecutarTarea } from '../../src/jobs';
import { expirarReservasJob } from '../../src/jobs/expirar-reservas.job';
import { hoyBogota, sumarDias } from '../../src/shared/utils/time';
import {
  api,
  crearComplejoActivo,
  crearUsuario,
  limpiarBd,
  pagarAbono,
  pool,
  proximoDia,
  query,
  reservar,
  type UsuarioPrueba,
} from '../helpers/api';

let admin: UsuarioPrueba;
let jugador: UsuarioPrueba;
let complejoId: number;
let canchaId: number;
const martes = () => proximoDia(2);

beforeEach(async () => {
  await limpiarBd();
  admin = await crearUsuario({ correo: 'admin@prueba.co' });
  jugador = await crearUsuario({ correo: 'jugador@prueba.co' });
  ({ complejoId, canchaId } = await crearComplejoActivo(admin, { ciudad: 'Cali' }));
});
afterAll(() => pool.end());

describe('HU-10 · consultar disponibilidad', () => {
  it('lista complejos con canchas libres y su precio, filtrando por fecha, hora, tipo y ciudad', async () => {
    const r = await api().get(`/api/disponibilidad?fecha=${martes()}&ciudad=cali&tipoFutbol=5&horaDesde=18:00&horaHasta=20:00`).expect(200);
    expect(r.body.resultados).toHaveLength(1);
    const [res] = r.body.resultados;
    expect(res.complejo).toMatchObject({ id: complejoId, distanciaKm: null });
    expect(res.canchas[0].franjas.map((f: { horaInicio: string }) => f.horaInicio)).toEqual(['18:00', '19:00']);
    expect(res.precioDesde).toBe(120000);
    expect((await api().get(`/api/disponibilidad?fecha=${martes()}&tipoFutbol=7`).expect(200)).body.resultados).toEqual([]);
  });

  it('calcula la distancia si se envía la ubicación del jugador', async () => {
    await query('UPDATE complejo SET latitud = 3.45, longitud = -76.53');
    const r = await api().get(`/api/disponibilidad?fecha=${martes()}&lat=3.46&lng=-76.53`).expect(200);
    expect(r.body.resultados[0].complejo.distanciaKm).toBeCloseTo(1.1, 0);
  });

  it('la grilla del complejo muestra reservada (rojo) y bloqueada (gris) por cancha', async () => {
    const fecha = martes();
    await reservar(jugador, canchaId, fecha, '10:00');
    await api().post(`/api/canchas/${canchaId}/bloqueos`).set(admin.auth).send({ fechaInicio: `${fecha}T12:00`, fechaFin: `${fecha}T13:00`, motivo: 'Mantenimiento' }).expect(201);
    const r = await api().get(`/api/complejos/${complejoId}/disponibilidad?fecha=${fecha}`).expect(200);
    const estado = (h: string) => r.body.canchas[0].franjas.find((f: { horaInicio: string }) => f.horaInicio === h).estado;
    expect([estado('09:00'), estado('10:00'), estado('12:00')]).toEqual(['libre', 'reservada', 'bloqueada']);
  });

  it('sin resultados en el rango, sugiere franjas cercanas (HU-10.3)', async () => {
    const fecha = martes();
    for (const h of ['18:00', '19:00']) await reservar(await crearUsuario(), canchaId, fecha, h);
    const r = await api().get(`/api/disponibilidad?fecha=${fecha}&horaDesde=18:00&horaHasta=20:00`).expect(200);
    expect(r.body.resultados).toEqual([]);
    const horas = r.body.sugerencias.map((s: { franja: { horaInicio: string } }) => s.franja.horaInicio);
    // La más cercana a las 18:00 es 17:00; luego empatan 16:00 y 20:00 (a 2 horas).
    expect(horas[0]).toBe('17:00');
    expect(horas.slice(1, 3).sort()).toEqual(['16:00', '20:00']);
  });
});

describe('HU-11 · reservar una cancha', () => {
  it('crea la reserva "pendiente de pago" retenida 15 minutos con precio y abono fijos (RN-02, RN-03, RN-04)', async () => {
    const r = await api().post('/api/reservas').set(jugador.auth).send({ canchaId, fecha: martes(), horaInicio: '18:00' }).expect(201);
    expect(r.body.reserva).toMatchObject({
      estado: 'pendiente_pago',
      horaFin: '19:00',
      precioTotal: 120000,
      abonoRequerido: 60000,
      saldoPendiente: 120000,
      totalPagado: 0,
      origen: 'web',
    });
    expect(r.body.reserva.codigo).toMatch(/^CY-[A-Z2-9]{8}$/);
    expect(r.body.reserva.segundosParaPagar).toBeGreaterThan(14 * 60);
    expect(r.body.reserva.segundosParaPagar).toBeLessThanOrEqual(15 * 60);
    // RN-04: cambiar la tarifa después no cambia el precio de la reserva.
    await query('UPDATE tarifa SET precio = 999000');
    const despues = await api().get(`/api/reservas/${r.body.reserva.id}`).set(jugador.auth).expect(200);
    expect(despues.body.reserva.precioTotal).toBe(120000);
  });

  it('409 "La franja ya no está disponible" si otra reserva activa la ocupa (RN-01)', async () => {
    await reservar(jugador, canchaId, martes(), '18:00');
    const r = await api().post('/api/reservas').set((await crearUsuario()).auth).send({ canchaId, fecha: martes(), horaInicio: '18:00' }).expect(409);
    expect(r.body.error).toEqual({ codigo: 'FRANJA_NO_DISPONIBLE', mensaje: 'La franja ya no está disponible' });
  });

  it.each([
    ['fuera del horario', { horaInicio: '07:00' }, 400, 'FUERA_DE_HORARIO'],
    ['que no coincide con un turno', { horaInicio: '18:30' }, 400, 'FUERA_DE_HORARIO'],
    ['en el pasado', { fecha: '2020-01-07' }, 400, 'FECHA_PASADA'],
    ['a más de 30 días', { fecha: sumarDias(hoyBogota(), 31) }, 400, 'FUERA_DE_ANTICIPACION'],
  ])('RN-06: rechaza una franja %s', async (_c, cambio, status, codigo) => {
    const r = await api().post('/api/reservas').set(jugador.auth).send({ canchaId, fecha: martes(), horaInicio: '18:00', ...cambio }).expect(status);
    expect(r.body.error.codigo).toBe(codigo);
  });

  it('RN-06: rechaza una franja bloqueada', async () => {
    const fecha = martes();
    await api().post(`/api/canchas/${canchaId}/bloqueos`).set(admin.auth).send({ fechaInicio: `${fecha}T18:00`, fechaFin: `${fecha}T20:00`, motivo: 'Evento' }).expect(201);
    const r = await api().post('/api/reservas').set(jugador.auth).send({ canchaId, fecha, horaInicio: '19:00' }).expect(409);
    expect(r.body.error.codigo).toBe('FRANJA_BLOQUEADA');
  });

  it('exige correo verificado y limita las reservas sin pagar por jugador', async () => {
    const sinVerificar = await crearUsuario({ verificado: false });
    expect((await api().post('/api/reservas').set(sinVerificar.auth).send({ canchaId, fecha: martes(), horaInicio: '08:00' }).expect(403)).body.error.codigo).toBe(
      'CORREO_NO_VERIFICADO',
    );
    for (const h of ['08:00', '09:00', '10:00']) await reservar(jugador, canchaId, martes(), h);
    const r = await api().post('/api/reservas').set(jugador.auth).send({ canchaId, fecha: martes(), horaInicio: '11:00' }).expect(409);
    expect(r.body.error.codigo).toBe('DEMASIADAS_PENDIENTES');
  });

  it('una cancha inactiva o de un complejo no aprobado no se puede reservar', async () => {
    await query("UPDATE cancha SET estado = 'inactiva' WHERE id = $1", [canchaId]);
    await api().post('/api/reservas').set(jugador.auth).send({ canchaId, fecha: martes(), horaInicio: '18:00' }).expect(404);
  });

  it('RN-02: sin pago en 15 minutos pasa a "Expirada" y libera la franja', async () => {
    const reserva = await reservar(jugador, canchaId, martes(), '18:00');
    await query("UPDATE reserva SET fecha_expiracion = now() - interval '1 second' WHERE id = $1", [reserva.id]);
    // La franja ya se ve libre aunque la tarea no haya corrido.
    const grilla = await api().get(`/api/complejos/${complejoId}/disponibilidad?fecha=${martes()}`).expect(200);
    expect(grilla.body.canchas[0].franjas.find((f: { horaInicio: string }) => f.horaInicio === '18:00').estado).toBe('libre');
    // La tarea programada la marca como expirada.
    expect(await ejecutarTarea(expirarReservasJob)).toBe(true);
    expect((await api().get(`/api/reservas/${reserva.id}`).set(jugador.auth).expect(200)).body.reserva.estado).toBe('expirada');
    // Y otra persona puede reservarla.
    await reservar(await crearUsuario(), canchaId, martes(), '18:00');
  });

  it('otro usuario no puede ver una reserva ajena (404, no se revela que existe)', async () => {
    const reserva = await reservar(jugador, canchaId, martes(), '18:00');
    await api().get(`/api/reservas/${reserva.id}`).set((await crearUsuario()).auth).expect(404);
    await api().get(`/api/reservas/${reserva.id}`).set(admin.auth).expect(200);
  });
});

describe('HU-13 · mis reservas', () => {
  it('próximas ordenadas por fecha con saldo; historial con canceladas y expiradas', async () => {
    const a = await reservar(jugador, canchaId, proximoDia(3), '10:00');
    const b = await reservar(jugador, canchaId, martes(), '10:00');
    await pagarAbono(jugador, b.id);
    const vencida = await reservar(jugador, canchaId, martes(), '11:00');
    await query("UPDATE reserva SET estado = 'expirada' WHERE id = $1", [vencida.id]);

    const proximas = await api().get('/api/mis-reservas').set(jugador.auth).expect(200);
    const fechas = proximas.body.reservas.map((r: { fecha: string }) => r.fecha);
    expect(fechas).toEqual([...fechas].sort());
    expect(proximas.body.reservas.map((r: { id: number }) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(proximas.body.reservas.find((r: { id: number }) => r.id === b.id)).toMatchObject({ estado: 'confirmada', saldoPendiente: 40000 });

    const historial = await api().get('/api/mis-reservas?vista=historial').set(jugador.auth).expect(200);
    expect(historial.body.reservas.map((r: { id: number }) => r.id)).toEqual([vencida.id]);
  });
});

describe('HU-14 · reservas del complejo', () => {
  it('el calendario del día muestra todas las canchas y sus reservas; la reserva manual ocupa la franja para todos', async () => {
    const fecha = martes();
    await reservar(jugador, canchaId, fecha, '18:00');
    const manual = await api()
      .post(`/api/complejos/${complejoId}/reservas-manuales`)
      .set(admin.auth)
      .send({ canchaId, fecha, horaInicio: '19:00', nombreCliente: 'Cliente Teléfono', celularCliente: '3110000000' })
      .expect(201);
    expect(manual.body.reserva).toMatchObject({ origen: 'manual', estado: 'confirmada', usuarioId: null, nombreClienteManual: 'Cliente Teléfono', segundosParaPagar: 0 });

    const cal = await api().get(`/api/complejos/${complejoId}/reservas?fecha=${fecha}`).set(admin.auth).expect(200);
    expect(cal.body.canchas).toHaveLength(1);
    expect(cal.body.reservas.map((r: { horaInicio: string }) => r.horaInicio)).toEqual(['18:00', '19:00']);
    const r = await api().post('/api/reservas').set((await crearUsuario()).auth).send({ canchaId, fecha, horaInicio: '19:00' }).expect(409);
    expect(r.body.error.codigo).toBe('FRANJA_NO_DISPONIBLE');
  });

  it('solo el administrador del complejo ve su calendario y crea reservas manuales (RNF-02)', async () => {
    const otro = await crearUsuario({ rol: 'AdminComplejo' });
    await api().get(`/api/complejos/${complejoId}/reservas?fecha=${martes()}`).set(otro.auth).expect(403);
    await api().get(`/api/complejos/${complejoId}/reservas?fecha=${martes()}`).set(jugador.auth).expect(403);
    await api()
      .post(`/api/complejos/${complejoId}/reservas-manuales`)
      .set(otro.auth)
      .send({ canchaId, fecha: martes(), horaInicio: '19:00', nombreCliente: 'X', celularCliente: '3110000000' })
      .expect(403);
  });

  it('"No asistió" y "Completada" solo después de empezar el partido (RN-07)', async () => {
    const reserva = await reservar(jugador, canchaId, martes(), '18:00');
    await pagarAbono(jugador, reserva.id);
    const r = await api().patch(`/api/reservas/${reserva.id}/estado`).set(admin.auth).send({ estado: 'no_asistio' }).expect(409);
    expect(r.body.error.codigo).toBe('PARTIDO_NO_INICIADO');
    // Simula que el partido ya ocurrió.
    await query("UPDATE reserva SET fecha = fecha - 14 WHERE id = $1", [reserva.id]);
    const ok = await api().patch(`/api/reservas/${reserva.id}/estado`).set(admin.auth).send({ estado: 'no_asistio' }).expect(200);
    expect(ok.body.reserva.estado).toBe('no_asistio');
    await api().patch(`/api/reservas/${reserva.id}/estado`).set(admin.auth).send({ estado: 'completada' }).expect(409);
  });
});

describe('advertencias de venues que dependen de reservas (HU-07.3, HU-09.2)', () => {
  it('cambiar el horario avisa de reservas reales fuera del nuevo horario', async () => {
    const fecha = martes();
    const reserva = await reservar(jugador, canchaId, fecha, '08:00');
    const r = await api()
      .put(`/api/complejos/${complejoId}/horarios`)
      .set(admin.auth)
      .send({ dias: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ diaSemana: d, horaApertura: '10:00', horaCierre: '22:00', duracionTurnoMin: 60 })) })
      .expect(200);
    expect(r.body.advertencias.reservasFueraDeHorario.map((x: { id: number }) => x.id)).toEqual([reserva.id]);
  });

  it('no se puede bloquear un rango con una reserva activa', async () => {
    const fecha = martes();
    const reserva = await reservar(jugador, canchaId, fecha, '10:00');
    const r = await api().post(`/api/canchas/${canchaId}/bloqueos`).set(admin.auth).send({ fechaInicio: `${fecha}T08:00`, fechaFin: `${fecha}T12:00`, motivo: 'Mantenimiento' }).expect(409);
    expect(r.body.error.datos.reservas[0].codigo).toBe(reserva.codigo);
  });

  it('bookingsApi.activas excluye retenciones vencidas', async () => {
    const reserva = await reservar(jugador, canchaId, martes(), '10:00');
    await query("UPDATE reserva SET fecha_expiracion = now() - interval '1 minute' WHERE id = $1", [reserva.id]);
    expect(await bookingsApi.activas({ canchaIds: [canchaId], desdeFecha: hoyBogota() })).toEqual([]);
  });
});
