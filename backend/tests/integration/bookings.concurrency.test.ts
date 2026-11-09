/** HT-05: dos reservas simultáneas de la misma franja: una gana y la otra recibe 409. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, crearComplejoActivo, crearUsuario, limpiarBd, pool, proximoDia, query } from '../helpers/api';

let canchaId: number;

beforeEach(async () => {
  await limpiarBd();
  const admin = await crearUsuario();
  ({ canchaId } = await crearComplejoActivo(admin));
});
afterAll(() => pool.end());

describe('control de concurrencia en reservas (HT-05, RNF-05)', () => {
  it('2 reservas simultáneas de la misma franja: solo una queda creada', async () => {
    const [a, b] = await Promise.all([crearUsuario(), crearUsuario()]);
    const fecha = proximoDia(4);
    const respuestas = await Promise.all(
      [a, b].map((u) => api().post('/api/reservas').set(u.auth).send({ canchaId, fecha, horaInicio: '20:00' })),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    const perdedora = respuestas.find((r) => r.status === 409)!;
    expect(perdedora.body.error.mensaje).toBe('La franja ya no está disponible');
    const filas = await query("SELECT 1 FROM reserva WHERE estado = 'pendiente_pago'");
    expect(filas).toHaveLength(1);
  });

  it('20 jugadores a la vez sobre 3 franjas: exactamente 3 reservas, sin cruces', async () => {
    const jugadores = await Promise.all(Array.from({ length: 20 }, () => crearUsuario()));
    const fecha = proximoDia(5);
    const horas = ['18:00', '19:00', '20:00'];
    const respuestas = await Promise.all(
      jugadores.map((u, i) => api().post('/api/reservas').set(u.auth).send({ canchaId, fecha, horaInicio: horas[i % 3] })),
    );
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(3);
    expect(respuestas.filter((r) => r.status === 409)).toHaveLength(17);
    expect(respuestas.every((r) => r.status === 201 || r.status === 409)).toBe(true);
  });

  it('la base de datos rechaza un cruce aunque se salte la API (restricción de exclusión, RN-01)', async () => {
    const u = await crearUsuario();
    const fecha = proximoDia(4);
    await api().post('/api/reservas').set(u.auth).send({ canchaId, fecha, horaInicio: '20:00' }).expect(201);
    await expect(
      query(
        `INSERT INTO reserva (codigo, usuario_id, cancha_id, fecha, hora_inicio, hora_fin, precio_total, abono_requerido, saldo_pendiente, estado, origen)
         VALUES ('CY-MANUALXX', $1, $2, $3, '20:30', '21:30', 1, 1, 1, 'confirmada', 'web')`,
        [u.id, canchaId, fecha],
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });
});
