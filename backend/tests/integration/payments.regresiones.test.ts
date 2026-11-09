/**
 * Regresiones de la revisión independiente del Sprint 2: dinero que se perdía o reservas que expiraban
 * con dinero adentro (A–D), y carreras de concurrencia (E, F). Cada prueba reproduce el escenario original.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ejecutarTarea } from '../../src/jobs';
import { expirarReservasJob } from '../../src/jobs/expirar-reservas.job';
import { partesBogota } from '../../src/shared/utils/time';
import { api, crearComplejoActivo, crearUsuario, limpiarBd, pool, proximoDia, query, reservar, type UsuarioPrueba } from '../helpers/api';

let admin: UsuarioPrueba;
let jugador: UsuarioPrueba;
let complejoId: number;
let canchaId: number;

beforeEach(async () => {
  await limpiarBd();
  admin = await crearUsuario();
  jugador = await crearUsuario();
  ({ complejoId, canchaId } = await crearComplejoActivo(admin));
});
afterAll(() => pool.end());

/** Mueve la reserva para que empiece dentro de `horas` horas, manteniendo la duración de 1 h. */
async function empiezaEn(reservaId: number, horas: number) {
  const p = partesBogota(new Date(Date.now() + horas * 3_600_000));
  const [h] = p.hora.split(':').map(Number) as [number];
  const ini = `${String(h).padStart(2, '0')}:00`;
  const fin = h === 23 ? '24:00' : `${String(h + 1).padStart(2, '0')}:00`;
  await query('UPDATE reserva SET fecha = $2, hora_inicio = $3, hora_fin = $4 WHERE id = $1', [reservaId, p.fecha, ini, fin]);
}

const reembolsosTotales = async () =>
  (await query<{ total: number }>('SELECT COALESCE(sum(valor), 0)::int AS total FROM reembolso'))[0]!.total;

describe('dinero (A–D)', () => {
  it('A: reprogramar a más barata, resolver ese reembolso y luego cancelar: se devuelve el resto completo', async () => {
    const r = await reservar(jugador, canchaId, proximoDia(3), '18:00'); // 120.000
    await api().post(`/api/reservas/${r.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi', valor: 120000 }).expect(201);
    await empiezaEn(r.id, 72);
    const rep = await api().post(`/api/reservas/${r.id}/reprogramar`).set(jugador.auth).send({ fecha: proximoDia(4), horaInicio: '10:00' }).expect(200); // 80.000
    expect(rep.body.excedenteReembolsado).toBe(40000);
    const [primero] = (await api().get(`/api/complejos/${complejoId}/reembolsos?estado=pendiente`).set(admin.auth)).body.reembolsos;
    await api().patch(`/api/reembolsos/${primero.id}`).set(admin.auth).expect(200);

    await empiezaEn(rep.body.reserva.id, 72);
    const c = await api().post(`/api/reservas/${rep.body.reserva.id}/cancelar`).set(jugador.auth).send({}).expect(200);
    expect(c.body.valorReembolso).toBe(80000);
    const pendientes = (await api().get(`/api/complejos/${complejoId}/reembolsos?estado=pendiente`).set(admin.auth)).body.reembolsos;
    expect(pendientes.map((x: { valor: number }) => x.valor)).toEqual([80000]);
    expect(await reembolsosTotales()).toBe(120000); // todo lo pagado vuelve
  });

  it('B: un excedente mayor que el último pago se reparte entre los pagos anteriores', async () => {
    const r = await reservar(jugador, canchaId, proximoDia(3), '18:00'); // 120.000
    await api().post(`/api/reservas/${r.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi' }).expect(201); // 60.000
    await api().post(`/api/reservas/${r.id}/pagos`).set(admin.auth).send({ metodo: 'efectivo', valor: 50000 }).expect(201);
    await api().post(`/api/reservas/${r.id}/pagos`).set(admin.auth).send({ metodo: 'efectivo', valor: 10000 }).expect(201);
    await empiezaEn(r.id, 72);
    const rep = await api().post(`/api/reservas/${r.id}/reprogramar`).set(jugador.auth).send({ fecha: proximoDia(4), horaInicio: '10:00' }).expect(200);
    expect(rep.body.excedenteReembolsado).toBe(40000);
    expect(await reembolsosTotales()).toBe(40000);
    expect(await query('SELECT valor FROM reembolso ORDER BY valor')).toEqual([{ valor: 10000 }, { valor: 30000 }]);
  });

  it('C: reprogramar a una franja más cara la deja confirmada: no expira con el abono adentro', async () => {
    const r = await reservar(jugador, canchaId, proximoDia(3), '10:00'); // 80.000
    await api().post(`/api/reservas/${r.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi' }).expect(201); // 40.000
    await empiezaEn(r.id, 72);
    const rep = await api().post(`/api/reservas/${r.id}/reprogramar`).set(jugador.auth).send({ fecha: proximoDia(4), horaInicio: '19:00' }).expect(200); // 120.000
    expect(rep.body.reserva).toMatchObject({ estado: 'confirmada', totalPagado: 40000, saldoPendiente: 80000, fechaExpiracion: null });
    await ejecutarTarea(expirarReservasJob, new Date(Date.now() + 60 * 60_000));
    expect((await api().get(`/api/reservas/${rep.body.reserva.id}`).set(jugador.auth)).body.reserva.estado).toBe('confirmada');
  });

  it('D: un pago parcial en el complejo confirma la reserva web; la tarea nunca expira una reserva con pagos', async () => {
    const r = await reservar(jugador, canchaId, proximoDia(3), '18:00'); // abono 60.000
    const p = await api().post(`/api/reservas/${r.id}/pagos`).set(admin.auth).send({ metodo: 'efectivo', valor: 20000 }).expect(201);
    expect(p.body.reserva).toMatchObject({ estado: 'confirmada', fechaExpiracion: null });
    // Aunque una reserva quedara pendiente con dinero (estado imposible por la API), la tarea no la expira.
    await query("UPDATE reserva SET estado = 'pendiente_pago', fecha_expiracion = now() - interval '1 minute' WHERE id = $1", [r.id]);
    await ejecutarTarea(expirarReservasJob);
    expect((await query<{ estado: string }>('SELECT estado FROM reserva WHERE id = $1', [r.id]))[0]!.estado).toBe('pendiente_pago');
  });

  it('el abono en línea cuenta lo ya pagado: completar la diferencia confirma la reserva', async () => {
    const r = await reservar(jugador, canchaId, proximoDia(3), '18:00'); // abono 60.000
    // Un pago parcial manual de 20.000 sobre una reserva que el jugador aún debe completar en línea:
    await query("UPDATE reserva SET saldo_pendiente = 100000 WHERE id = $1", [r.id]);
    const ok = await api().post(`/api/reservas/${r.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi' }).expect(201);
    expect(ok.body.pago.valor).toBe(40000);
    expect(ok.body.reserva.estado).toBe('confirmada');
  });

  it('la base de datos impide que los reembolsos de un pago superen su valor', async () => {
    const r = await reservar(jugador, canchaId, proximoDia(3), '18:00');
    const { body } = await api().post(`/api/reservas/${r.id}/pagos/abono`).set(jugador.auth).send({ metodo: 'nequi' }).expect(201);
    await query("INSERT INTO reembolso (pago_id, valor, porcentaje, motivo) VALUES ($1, 50000, 83, 'a')", [body.pago.id]);
    await expect(query("INSERT INTO reembolso (pago_id, valor, porcentaje, motivo) VALUES ($1, 20000, 33, 'b')", [body.pago.id])).rejects.toMatchObject({
      code: '23514',
    });
  });
});

describe('concurrencia (E, F)', () => {
  it('E: el límite de 3 reservas sin pagar no se puede saltar con reservas simultáneas en varias canchas', async () => {
    const otras = await Promise.all(
      ['Cancha 2', 'Cancha 3', 'Cancha 4', 'Cancha 5'].map(async (nombre) => {
        const c = await api().post(`/api/complejos/${complejoId}/canchas`).set(admin.auth).send({ nombre, tipoFutbol: 5, superficie: 'S' }).expect(201);
        await api().post(`/api/canchas/${c.body.cancha.id}/tarifas`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '08:00', horaFin: '23:00', precio: 80000 }).expect(201);
        return c.body.cancha.id as number;
      }),
    );
    const fecha = proximoDia(3);
    const respuestas = await Promise.all(
      [canchaId, ...otras].map((id) => api().post('/api/reservas').set(jugador.auth).send({ canchaId: id, fecha, horaInicio: '10:00' })),
    );
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(3);
    expect(respuestas.filter((r) => r.status === 409).every((r) => r.body.error.codigo === 'DEMASIADAS_PENDIENTES')).toBe(true);
  });

  it('F: reprogramar y reservar la misma franja a la vez nunca da 500 (sin interbloqueo)', async () => {
    for (let i = 0; i < 5; i++) {
      await limpiarBd();
      const a = await crearUsuario();
      const b = await crearUsuario();
      const { canchaId: cancha } = await crearComplejoActivo(await crearUsuario());
      const r = await reservar(a, cancha, proximoDia(3), '10:00');
      await api().post(`/api/reservas/${r.id}/pagos/abono`).set(a.auth).send({ metodo: 'nequi' }).expect(201);
      await empiezaEn(r.id, 72);
      const destino = { fecha: proximoDia(4), horaInicio: '11:00' };
      const [rep, nueva] = await Promise.all([
        api().post(`/api/reservas/${r.id}/reprogramar`).set(a.auth).send(destino),
        api().post('/api/reservas').set(b.auth).send({ canchaId: cancha, ...destino }),
      ]);
      const detalle = JSON.stringify({ reprogramar: [rep.status, rep.body.error], reservar: [nueva.status, nueva.body.error] });
      // Quien pierde recibe 409 (franja ocupada o conflicto concurrente), nunca un 500.
      expect([rep.status, nueva.status].every((s) => s === 200 || s === 201 || s === 409), detalle).toBe(true);
      // Exactamente uno de los dos se quedó con la franja.
      expect([rep.status === 200, nueva.status === 201].filter(Boolean), detalle).toHaveLength(1);
    }
  }, 90_000);
});
