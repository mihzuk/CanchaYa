/** Pruebas de integración de EP-04: abono, saldo, cancelaciones, reprogramación y reembolsos (HU-12, HU-16 a HU-18, RN-05). */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { instanteBogota, partesBogota, sumarDias } from '../../src/shared/utils/time';
import {
  api,
  correos,
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

beforeEach(async () => {
  await limpiarBd();
  admin = await crearUsuario({ correo: 'admin@prueba.co' });
  jugador = await crearUsuario({ correo: 'jugador@prueba.co' });
  ({ complejoId, canchaId } = await crearComplejoActivo(admin));
});
afterAll(() => pool.end());

/** Mueve una reserva para que empiece dentro de `horas` horas (para probar RN-05). */
async function empiezaEn(reservaId: number, horas: number) {
  const inicio = new Date(Date.now() + horas * 3_600_000);
  const p = partesBogota(inicio);
  const [h, m] = p.hora.split(':').map(Number) as [number, number];
  const inicioTxt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const finMin = Math.min(h * 60 + m + 60, 24 * 60);
  const finTxt = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;
  await query('UPDATE reserva SET fecha = $2, hora_inicio = $3, hora_fin = $4 WHERE id = $1', [reservaId, p.fecha, inicioTxt, finTxt]);
  expect(instanteBogota(p.fecha, inicioTxt).getTime()).toBeGreaterThan(Date.now());
}

describe('HU-16 · pagar el abono en línea', () => {
  it('aprobado: registra el pago con fecha, método, valor y referencia; la reserva queda confirmada y llega el comprobante', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    const r = await pagarAbono(jugador, reserva.id);
    expect(r.pago).toMatchObject({ tipo: 'abono', metodo: 'tarjeta', valor: 60000, estado: 'aprobado' });
    expect(r.pago.referencia).toMatch(/^SIM-/);
    expect(r.pago.fecha).toEqual(expect.any(String));
    expect(r.reserva).toMatchObject({ estado: 'confirmada', saldoPendiente: 60000, totalPagado: 60000, fechaExpiracion: null });
    const comprobante = correos.ultimoPara('jugador@prueba.co');
    expect(comprobante?.asunto).toContain(reserva.codigo);
    expect(comprobante?.texto).toMatch(/60\.000/);
  });

  it('rechazado: 402, la reserva sigue pendiente y se puede reintentar (HU-16.2)', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    const rechazo = await api()
      .post(`/api/reservas/${reserva.id}/pagos/abono`)
      .set(jugador.auth)
      .send({ metodo: 'tarjeta', datos: { numeroTarjeta: '4000 0000 0000 0002' } })
      .expect(402);
    expect(rechazo.body.error.codigo).toBe('PAGO_RECHAZADO');
    expect(rechazo.body.error.datos.pago.estado).toBe('rechazado');
    expect((await api().get(`/api/reservas/${reserva.id}`).set(jugador.auth)).body.reserva.estado).toBe('pendiente_pago');
    await pagarAbono(jugador, reserva.id);
    const pagos = await api().get(`/api/reservas/${reserva.id}/pagos`).set(jugador.auth).expect(200);
    expect(pagos.body.pagos.map((p: { estado: string }) => p.estado).sort()).toEqual(['aprobado', 'rechazado']);
  });

  it('PSE con resultado simulado rechazado', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    await api().post(`/api/reservas/${reserva.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'pse', datos: { resultado: 'rechazado' } }).expect(402);
  });

  it('puede pagar el total en línea y la reserva queda pagada', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    const r = await api().post(`/api/reservas/${reserva.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi', valor: 120000 }).expect(201);
    expect(r.body.reserva).toMatchObject({ estado: 'pagada', saldoPendiente: 0 });
  });

  it('no se puede pagar una reserva vencida, ajena, ya pagada o por menos del abono', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    await api().post(`/api/reservas/${reserva.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi', valor: 1000 }).expect(400);
    await api().post(`/api/reservas/${reserva.id}/pagos/abono`).set((await crearUsuario()).auth).send({ metodo: 'nequi' }).expect(404);
    await pagarAbono(jugador, reserva.id);
    expect((await api().post(`/api/reservas/${reserva.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi' }).expect(409)).body.error.codigo).toBe(
      'RESERVA_NO_PENDIENTE',
    );
    const otra = await reservar(jugador, canchaId, proximoDia(2), '19:00');
    await query("UPDATE reserva SET fecha_expiracion = now() - interval '1 second' WHERE id = $1", [otra.id]);
    expect((await api().post(`/api/reservas/${otra.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi' }).expect(409)).body.error.codigo).toBe(
      'RESERVA_EXPIRADA',
    );
  });

  it('dos pagos simultáneos del mismo abono: solo uno se cobra', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    const respuestas = await Promise.all([1, 2].map(() => api().post(`/api/reservas/${reserva.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi' })));
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await query("SELECT 1 FROM pago WHERE estado = 'aprobado'")).toHaveLength(1);
  });
});

describe('HU-17 · registrar pagos en el complejo', () => {
  it('el saldo en efectivo deja la reserva "Pagada" y el saldo en $0', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    await pagarAbono(jugador, reserva.id);
    const r = await api().post(`/api/reservas/${reserva.id}/pagos`).set(admin.auth).send({ metodo: 'efectivo' }).expect(201);
    expect(r.body.pago).toMatchObject({ tipo: 'saldo', metodo: 'efectivo', valor: 60000, estado: 'aprobado' });
    expect(r.body.reserva).toMatchObject({ estado: 'pagada', saldoPendiente: 0 });
    await api().post(`/api/reservas/${reserva.id}/pagos`).set(admin.auth).send({ metodo: 'efectivo' }).expect(409);
  });

  it('una reserva manual se paga por partes en el complejo; no se puede pagar más del saldo', async () => {
    const m = await api()
      .post(`/api/complejos/${complejoId}/reservas-manuales`)
      .set(admin.auth)
      .send({ canchaId, fecha: proximoDia(3), horaInicio: '10:00', nombreCliente: 'Cliente', celularCliente: '3001112233' })
      .expect(201);
    const id = m.body.reserva.id;
    await api().post(`/api/reservas/${id}/pagos`).set(admin.auth).send({ metodo: 'transferencia', valor: 90000 }).expect(400);
    const parcial = await api().post(`/api/reservas/${id}/pagos`).set(admin.auth).send({ metodo: 'transferencia', valor: 30000, referencia: 'TRX-1' }).expect(201);
    expect(parcial.body.reserva).toMatchObject({ estado: 'confirmada', saldoPendiente: 50000 });
    const pagos = await api().get(`/api/complejos/${complejoId}/pagos`).set(admin.auth).expect(200);
    expect(pagos.body.pagos[0]).toMatchObject({ valor: 30000, referencia: 'TRX-1', reserva: { cliente: 'Cliente' } });
  });

  it('un jugador u otro administrador no pueden registrar pagos (RNF-02)', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(2), '18:00');
    await api().post(`/api/reservas/${reserva.id}/pagos`).set(jugador.auth).send({ metodo: 'efectivo' }).expect(403);
    await api().post(`/api/reservas/${reserva.id}/pagos`).set((await crearUsuario({ rol: 'AdminComplejo' })).auth).send({ metodo: 'efectivo' }).expect(404);
    await api().get(`/api/complejos/${complejoId}/pagos`).set((await crearUsuario({ rol: 'AdminComplejo' })).auth).expect(403);
  });
});

describe('HU-12 · cancelar (RN-05)', () => {
  it.each([
    [48, 100, 60000],
    [12, 50, 30000],
    [3, 0, 0],
  ])('con %s h de anticipación se reembolsa el %s %% del abono', async (horas, porcentaje, valor) => {
    const reserva = await reservar(jugador, canchaId, proximoDia(3), '18:00');
    await pagarAbono(jugador, reserva.id);
    await empiezaEn(reserva.id, horas);
    const preview = await api().get(`/api/reservas/${reserva.id}/cancelacion`).set(jugador.auth).expect(200);
    expect(preview.body).toMatchObject({ porcentajeReembolso: porcentaje, valorReembolso: valor, totalPagado: 60000 });
    const r = await api().post(`/api/reservas/${reserva.id}/cancelar`).set(jugador.auth).send({}).expect(200);
    expect(r.body).toMatchObject({ porcentajeReembolso: porcentaje, valorReembolso: valor });
    expect(r.body.reserva.estado).toBe('cancelada');
    const reembolsos = await query<{ valor: number; estado: string }>('SELECT valor, estado FROM reembolso');
    expect(reembolsos).toEqual(valor ? [{ valor, estado: 'pendiente' }] : []);
  });

  it('cancelar libera la franja y no se puede cancelar dos veces', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(3), '18:00');
    await api().post(`/api/reservas/${reserva.id}/cancelar`).set(jugador.auth).send({}).expect(200);
    await api().post(`/api/reservas/${reserva.id}/cancelar`).set(jugador.auth).send({}).expect(409);
    await reservar(await crearUsuario(), canchaId, proximoDia(3), '18:00');
  });

  it('si cancela el complejo: motivo obligatorio y reembolso del 100 % aunque falten menos de 6 h (HU-28.3)', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(3), '18:00');
    await pagarAbono(jugador, reserva.id);
    await empiezaEn(reserva.id, 2);
    await api().post(`/api/reservas/${reserva.id}/cancelar`).set(admin.auth).send({}).expect(400);
    const r = await api().post(`/api/reservas/${reserva.id}/cancelar`).set(admin.auth).send({ motivo: 'Lluvia fuerte, cancha inundada' }).expect(200);
    expect(r.body).toMatchObject({ porcentajeReembolso: 100, valorReembolso: 60000 });
    expect(r.body.reserva.motivoCancelacion).toBe('Lluvia fuerte, cancha inundada');
  });
});

describe('HU-12 · reprogramar', () => {
  it('con más de 24 h el abono se traslada a la nueva franja sin costo y la franja anterior se libera', async () => {
    const fecha = proximoDia(3);
    const reserva = await reservar(jugador, canchaId, fecha, '18:00');
    await pagarAbono(jugador, reserva.id);
    await empiezaEn(reserva.id, 48);
    const destino = sumarDias(fecha, 1);
    const r = await api().post(`/api/reservas/${reserva.id}/reprogramar`).set(jugador.auth).send({ fecha: destino, horaInicio: '19:00' }).expect(200);
    expect(r.body.reserva).toMatchObject({ fecha: destino, horaInicio: '19:00', estado: 'confirmada', totalPagado: 60000, saldoPendiente: 60000, reprogramadaDeId: reserva.id });
    expect((await api().get(`/api/reservas/${reserva.id}`).set(jugador.auth)).body.reserva).toMatchObject({ estado: 'cancelada', motivoCancelacion: 'Reprogramada' });
    const pagos = await api().get(`/api/reservas/${r.body.reserva.id}/pagos`).set(jugador.auth).expect(200);
    expect(pagos.body.pagos).toHaveLength(1);
  });

  it('a una franja más barata: queda pagada y la diferencia se reembolsa', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(3), '18:00');
    await api().post(`/api/reservas/${reserva.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi', valor: 120000 }).expect(201);
    await empiezaEn(reserva.id, 48);
    const r = await api().post(`/api/reservas/${reserva.id}/reprogramar`).set(jugador.auth).send({ fecha: proximoDia(4), horaInicio: '10:00' }).expect(200);
    expect(r.body).toMatchObject({ excedenteReembolsado: 40000, reserva: { estado: 'pagada', precioTotal: 80000, saldoPendiente: 0 } });
    expect(await query('SELECT valor FROM reembolso')).toEqual([{ valor: 40000 }]);
  });

  it('409 con menos de 24 h o si la nueva franja está ocupada (la reserva original queda intacta)', async () => {
    const otra = await reservar(await crearUsuario(), canchaId, proximoDia(4), '19:00');
    const reserva = await reservar(jugador, canchaId, proximoDia(3), '18:00');
    await pagarAbono(jugador, reserva.id);
    await empiezaEn(reserva.id, 48);
    const ocupada = await api().post(`/api/reservas/${reserva.id}/reprogramar`).set(jugador.auth).send({ fecha: proximoDia(4), horaInicio: '19:00' }).expect(409);
    expect(ocupada.body.error.codigo).toBe('FRANJA_NO_DISPONIBLE');
    expect((await api().get(`/api/reservas/${reserva.id}`).set(jugador.auth)).body.reserva.estado).toBe('confirmada');
    expect(otra.estado).toBe('pendiente_pago');
    await empiezaEn(reserva.id, 10);
    expect((await api().post(`/api/reservas/${reserva.id}/reprogramar`).set(jugador.auth).send({ fecha: proximoDia(5), horaInicio: '10:00' }).expect(409)).body.error.codigo).toBe(
      'FUERA_DE_PLAZO',
    );
  });
});

describe('HU-18 · gestionar reembolsos', () => {
  it('el complejo ve los reembolsos pendientes y al marcarlos "Reembolsado" se resuelven una sola vez', async () => {
    const reserva = await reservar(jugador, canchaId, proximoDia(3), '18:00');
    await pagarAbono(jugador, reserva.id);
    await empiezaEn(reserva.id, 48);
    await api().post(`/api/reservas/${reserva.id}/cancelar`).set(jugador.auth).send({}).expect(200);

    const lista = await api().get(`/api/complejos/${complejoId}/reembolsos?estado=pendiente`).set(admin.auth).expect(200);
    expect(lista.body.reembolsos).toHaveLength(1);
    expect(lista.body.reembolsos[0]).toMatchObject({ valor: 60000, porcentaje: 100, estado: 'pendiente', reserva: { codigo: reserva.codigo } });
    expect(lista.body.reembolsos[0].motivo).toContain(reserva.codigo);

    const id = lista.body.reembolsos[0].id;
    await api().patch(`/api/reembolsos/${id}`).set((await crearUsuario({ rol: 'AdminComplejo' })).auth).expect(404);
    const r = await api().patch(`/api/reembolsos/${id}`).set(admin.auth).expect(200);
    expect(r.body.reembolso).toMatchObject({ estado: 'reembolsado' });
    expect(r.body.reembolso.fechaResolucion).toEqual(expect.any(String));
    await api().patch(`/api/reembolsos/${id}`).set(admin.auth).expect(409);
    expect(await query("SELECT estado FROM pago WHERE estado = 'reembolsado'")).toHaveLength(1);
    expect((await api().get(`/api/complejos/${complejoId}/reembolsos?estado=pendiente`).set(admin.auth)).body.reembolsos).toEqual([]);
  });
});
