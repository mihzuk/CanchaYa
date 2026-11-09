/** Equipos (HU-19 a HU-21) a través de la API contra la base de pruebas. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, crearUsuario, limpiarBd, pool, query, type UsuarioPrueba } from '../../../../tests/helpers/api';

let capitan: UsuarioPrueba;
let jugador: UsuarioPrueba;
let otro: UsuarioPrueba;

const crearEquipo = async (u: UsuarioPrueba, nombre = 'Los Cracks') => {
  const r = await api().post('/api/equipos').set(u.auth).send({ nombre, nivel: 'intermedio', tipoFutbol: 5 }).expect(201);
  return r.body.equipo as { id: number; capitanId: number; totalMiembros: number };
};

/** Une a un jugador por invitación de usuario. */
async function unir(equipoId: number, cap: UsuarioPrueba, u: UsuarioPrueba) {
  const inv = await api().post(`/api/equipos/${equipoId}/invitaciones`).set(cap.auth).send({ username: u.username }).expect(201);
  await api().post(`/api/invitaciones/${inv.body.invitacion.id}/respuesta`).set(u.auth).send({ aceptar: true }).expect(204);
}

beforeEach(async () => {
  await limpiarBd();
  capitan = await crearUsuario({ username: 'capitan1' });
  jugador = await crearUsuario({ username: 'jugador1' });
  otro = await crearUsuario({ username: 'otro1' });
});
afterAll(() => pool.end());

describe('HU-19 · crear equipo', () => {
  it('quien lo crea queda como capitán', async () => {
    const e = await crearEquipo(capitan);
    expect(e).toMatchObject({ capitanId: capitan.id, totalMiembros: 1 });
    const d = await api().get(`/api/equipos/${e.id}`).set(capitan.auth).expect(200);
    expect(d.body).toMatchObject({ esCapitan: true, esMiembro: true });
    expect(d.body.miembros[0]).toMatchObject({ usuarioId: capitan.id, rolEnEquipo: 'capitan', username: 'capitan1' });
    expect(JSON.stringify(d.body)).not.toMatch(/correo|celular/);
  });

  it('409 si el nombre ya existe, sin distinguir mayúsculas', async () => {
    await crearEquipo(capitan);
    const r = await api().post('/api/equipos').set(jugador.auth).send({ nombre: 'LOS CRACKS', nivel: 'avanzado', tipoFutbol: 7 }).expect(409);
    expect(r.body.error.codigo).toBe('NOMBRE_EQUIPO_EN_USO');
  });

  it('400 con nivel o modalidad inválidos', async () => {
    await api().post('/api/equipos').set(capitan.auth).send({ nombre: 'Equipo', nivel: 'pro', tipoFutbol: 9 }).expect(400);
  });
});

describe('HU-20 · invitar y unirse', () => {
  it('por usuario: al aceptar aparece en la plantilla y conserva sus otros equipos', async () => {
    const propio = await crearEquipo(jugador, 'Mi Otro Equipo');
    const e = await crearEquipo(capitan);
    await unir(e.id, capitan, jugador);
    const mios = await api().get('/api/mis-equipos').set(jugador.auth).expect(200);
    expect(mios.body.equipos.map((x: { id: number }) => x.id).sort()).toEqual([propio.id, e.id].sort());
  });

  it('el invitado ve su invitación; si la rechaza no entra', async () => {
    const e = await crearEquipo(capitan);
    await api().post(`/api/equipos/${e.id}/invitaciones`).set(capitan.auth).send({ username: 'jugador1' }).expect(201);
    const inv = await api().get('/api/mis-invitaciones').set(jugador.auth).expect(200);
    expect(inv.body.invitaciones[0]).toMatchObject({ estado: 'pendiente', equipo: { id: e.id } });
    await api().post(`/api/invitaciones/${inv.body.invitaciones[0].id}/respuesta`).set(jugador.auth).send({ aceptar: false }).expect(204);
    expect((await api().get(`/api/equipos/${e.id}`)).body.miembros).toHaveLength(1);
  });

  it('otro usuario no puede responder una invitación ajena', async () => {
    const e = await crearEquipo(capitan);
    const inv = await api().post(`/api/equipos/${e.id}/invitaciones`).set(capitan.auth).send({ username: 'jugador1' }).expect(201);
    await api().post(`/api/invitaciones/${inv.body.invitacion.id}/respuesta`).set(otro.auth).send({ aceptar: true }).expect(404);
  });

  it('errores: usuario inexistente, invitación repetida, ya miembro, no capitán', async () => {
    const e = await crearEquipo(capitan);
    await api().post(`/api/equipos/${e.id}/invitaciones`).set(capitan.auth).send({ username: 'no_existe' }).expect(404);
    await api().post(`/api/equipos/${e.id}/invitaciones`).set(jugador.auth).send({ username: 'otro1' }).expect(403);
    await api().post(`/api/equipos/${e.id}/invitaciones`).set(capitan.auth).send({ username: 'jugador1' }).expect(201);
    expect((await api().post(`/api/equipos/${e.id}/invitaciones`).set(capitan.auth).send({ username: 'jugador1' }).expect(409)).body.error.codigo).toBe('INVITACION_PENDIENTE');
    expect((await api().post(`/api/equipos/${e.id}/invitaciones`).set(capitan.auth).send({ username: 'capitan1' }).expect(409)).body.error.codigo).toBe('YA_ES_MIEMBRO');
  });

  it('por enlace: lo usan varios jugadores; se guarda hasheado; revocado o vencido deja de servir', async () => {
    const e = await crearEquipo(capitan);
    const { body } = await api().post(`/api/equipos/${e.id}/enlaces`).set(capitan.auth).expect(201);
    const guardado = await query<{ token_enlace: string; id: number }>('SELECT id, token_enlace FROM invitacion_equipo');
    expect(guardado[0]!.token_enlace).not.toBe(body.token);

    expect((await api().get(`/api/enlaces-equipo/${body.token}`).expect(200)).body.equipo.nombre).toBe('Los Cracks');
    await api().post(`/api/enlaces-equipo/${body.token}/unirse`).expect(401);
    await api().post(`/api/enlaces-equipo/${body.token}/unirse`).set(jugador.auth).expect(200);
    await api().post(`/api/enlaces-equipo/${body.token}/unirse`).set(jugador.auth).expect(409);
    await api().post(`/api/enlaces-equipo/${body.token}/unirse`).set(otro.auth).expect(200);

    await query("UPDATE invitacion_equipo SET fecha = now() - interval '8 days'");
    expect((await api().get(`/api/enlaces-equipo/${body.token}`).expect(400)).body.error.codigo).toBe('TOKEN_EXPIRADO');
    await query('UPDATE invitacion_equipo SET fecha = now()');
    await api().delete(`/api/equipos/${e.id}/invitaciones/${guardado[0]!.id}`).set(capitan.auth).expect(204);
    expect((await api().get(`/api/enlaces-equipo/${body.token}`).expect(400)).body.error.codigo).toBe('TOKEN_INVALIDO');
  });
});

describe('HU-21 · administrar miembros', () => {
  it('expulsar: deja de ver los partidos del equipo; el capitán no se expulsa a sí mismo', async () => {
    const e = await crearEquipo(capitan);
    await unir(e.id, capitan, jugador);
    await api().get(`/api/equipos/${e.id}/partidos`).set(jugador.auth).expect(200);
    await api().delete(`/api/equipos/${e.id}/miembros/${capitan.id}`).set(capitan.auth).expect(409);
    await api().delete(`/api/equipos/${e.id}/miembros/${jugador.id}`).set(jugador.auth).expect(403);
    await api().delete(`/api/equipos/${e.id}/miembros/${jugador.id}`).set(capitan.auth).expect(204);
    await api().get(`/api/equipos/${e.id}/partidos`).set(jugador.auth).expect(403);
  });

  it('ceder la capitanía: cambia cuando el otro acepta y el anterior queda como miembro', async () => {
    const e = await crearEquipo(capitan);
    await unir(e.id, capitan, jugador);
    const prop = await api().post(`/api/equipos/${e.id}/capitania`).set(capitan.auth).send({ usuarioId: jugador.id }).expect(200);
    expect(prop.body.equipo).toMatchObject({ capitanId: capitan.id, capitanPropuestoId: jugador.id });
    await api().post(`/api/equipos/${e.id}/capitania/respuesta`).set(otro.auth).send({ aceptar: true }).expect(409);
    const r = await api().post(`/api/equipos/${e.id}/capitania/respuesta`).set(jugador.auth).send({ aceptar: true }).expect(200);
    expect(r.body.equipo).toMatchObject({ capitanId: jugador.id, capitanPropuestoId: null });
    const d = await api().get(`/api/equipos/${e.id}`);
    const rol = (id: number) => d.body.miembros.find((m: { usuarioId: number }) => m.usuarioId === id).rolEnEquipo;
    expect([rol(jugador.id), rol(capitan.id)]).toEqual(['capitan', 'miembro']);
  });

  it('rechazar la capitanía la deja como estaba; solo se propone a miembros', async () => {
    const e = await crearEquipo(capitan);
    await api().post(`/api/equipos/${e.id}/capitania`).set(capitan.auth).send({ usuarioId: otro.id }).expect(404);
    await unir(e.id, capitan, jugador);
    await api().post(`/api/equipos/${e.id}/capitania`).set(capitan.auth).send({ usuarioId: jugador.id }).expect(200);
    const r = await api().post(`/api/equipos/${e.id}/capitania/respuesta`).set(jugador.auth).send({ aceptar: false }).expect(200);
    expect(r.body.equipo).toMatchObject({ capitanId: capitan.id, capitanPropuestoId: null });
  });

  it('si el único miembro sale, el equipo queda inactivo; un capitán con plantilla debe ceder antes', async () => {
    const e = await crearEquipo(capitan);
    await unir(e.id, capitan, jugador);
    expect((await api().post(`/api/equipos/${e.id}/salir`).set(capitan.auth).expect(409)).body.error.codigo).toBe('CAPITAN_DEBE_CEDER');
    expect((await api().post(`/api/equipos/${e.id}/salir`).set(jugador.auth).expect(200)).body).toEqual({ equipoInactivo: false });
    expect((await api().post(`/api/equipos/${e.id}/salir`).set(capitan.auth).expect(200)).body).toEqual({ equipoInactivo: true });
    expect((await api().get('/api/mis-equipos').set(capitan.auth)).body.equipos).toEqual([]);
    expect((await api().post(`/api/equipos/${e.id}/invitaciones`).set(capitan.auth).send({ username: 'otro1' }).expect(409)).body.error.codigo).toBe('EQUIPO_INACTIVO');
  });

  it('el perfil público muestra los equipos del jugador (HU-04.2)', async () => {
    const e = await crearEquipo(capitan);
    const p = await api().get('/api/usuarios/capitan1').expect(200);
    expect(p.body.perfil.equipos).toEqual([{ id: e.id, nombre: 'Los Cracks', escudoUrl: null }]);
  });
});
