/** Pruebas de integración de EP-02: complejos, canchas, horarios, tarifas y bloqueos (HU-05 a HU-09). */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { registrarConsultaReservas } from '../../src/modules/venues';
import { hoyBogota, sumarDias, diaSemanaIso } from '../../src/shared/utils/time';
import { api, crearComplejoActivo, crearUsuario, limpiarBd, pool, query, type UsuarioPrueba } from '../helpers/api';

const complejoBase = {
  nombre: 'Sintéticas del Norte',
  descripcion: 'Canchas nuevas',
  direccion: 'Cra 15 # 120-30',
  ciudad: 'Bogotá',
  barrio: 'Usaquén',
  telefono: '6017654321',
  servicioIds: [1, 2, 3],
};

/** Próxima fecha (desde mañana) que cae en el día ISO indicado y no es festivo de fin de semana. */
function proximo(diaIso: number): string {
  let f = sumarDias(hoyBogota(), 1);
  while (diaSemanaIso(f) !== diaIso) f = sumarDias(f, 1);
  return f;
}

let admin: UsuarioPrueba;
let superadmin: UsuarioPrueba;

beforeEach(async () => {
  await limpiarBd();
  registrarConsultaReservas(async () => []);
  admin = await crearUsuario({ rol: 'Jugador', correo: 'dueno@prueba.co' });
  superadmin = await crearUsuario({ rol: 'Superadmin', correo: 'super@prueba.co' });
});
afterAll(() => pool.end());

describe('HU-05 · registrar complejo', () => {
  it('queda "pendiente", el usuario pasa a AdminComplejo y no aparece en búsquedas hasta aprobarse', async () => {
    const r = await api().post('/api/complejos').set(admin.auth).send(complejoBase).expect(201);
    expect(r.body.complejo).toMatchObject({ estado: 'pendiente', porcentajeAbono: 50, adminId: admin.id });
    expect(r.body.complejo.servicios.map((s: { nombre: string }) => s.nombre)).toEqual(['Parqueadero', 'Camerinos', 'Cafetería']);

    const yo = await api().get('/api/auth/yo').set(admin.auth).expect(200);
    expect(yo.body.usuario.rol).toBe('AdminComplejo');

    const busqueda = await api().get('/api/complejos').expect(200);
    expect(busqueda.body.total).toBe(0);
    // Un visitante no ve el detalle de un complejo pendiente; el dueño sí.
    await api().get(`/api/complejos/${r.body.complejo.id}`).expect(404);
    await api().get(`/api/complejos/${r.body.complejo.id}`).set(admin.auth).expect(200);
  });

  it('el superadministrador lo aprueba y aparece en búsquedas con sus servicios como etiquetas', async () => {
    const { body } = await api().post('/api/complejos').set(admin.auth).send(complejoBase).expect(201);
    const pendientes = await api().get('/api/complejos/pendientes').set(superadmin.auth).expect(200);
    expect(pendientes.body.complejos).toHaveLength(1);

    const ap = await api().patch(`/api/complejos/${body.complejo.id}/aprobacion`).set(superadmin.auth).send({ aprobar: true }).expect(200);
    expect(ap.body.complejo.estado).toBe('activo');

    const busqueda = await api().get('/api/complejos?ciudad=bogotá').expect(200);
    expect(busqueda.body.complejos).toHaveLength(1);
    expect(busqueda.body.complejos[0].servicios).toEqual(['Parqueadero', 'Camerinos', 'Cafetería']);
    await api().patch(`/api/complejos/${body.complejo.id}/aprobacion`).set(superadmin.auth).send({ aprobar: true }).expect(409);
  });

  it('rechazar exige motivo; un AdminComplejo no puede aprobar', async () => {
    const { body } = await api().post('/api/complejos').set(admin.auth).send(complejoBase).expect(201);
    await api().patch(`/api/complejos/${body.complejo.id}/aprobacion`).set(admin.auth).send({ aprobar: true }).expect(403);
    await api().patch(`/api/complejos/${body.complejo.id}/aprobacion`).set(superadmin.auth).send({ aprobar: false }).expect(400);
    const r = await api()
      .patch(`/api/complejos/${body.complejo.id}/aprobacion`)
      .set(superadmin.auth)
      .send({ aprobar: false, motivo: 'Faltan fotos reales' })
      .expect(200);
    expect(r.body.complejo).toMatchObject({ estado: 'rechazado', motivoRechazo: 'Faltan fotos reales' });
    // Al corregirlo vuelve a revisión.
    const editado = await api().put(`/api/complejos/${body.complejo.id}`).set(admin.auth).send(complejoBase).expect(200);
    expect(editado.body.complejo.estado).toBe('pendiente');
  });

  it('403 CORREO_NO_VERIFICADO: hay que confirmar el correo antes de registrar un complejo', async () => {
    const sinVerificar = await crearUsuario({ verificado: false });
    const r = await api().post('/api/complejos').set(sinVerificar.auth).send(complejoBase).expect(403);
    expect(r.body.error.codigo).toBe('CORREO_NO_VERIFICADO');
  });

  it('la lista de pendientes trae teléfono y descripción para decidir', async () => {
    await api().post('/api/complejos').set(admin.auth).send(complejoBase).expect(201);
    const r = await api().get('/api/complejos/pendientes').set(superadmin.auth).expect(200);
    expect(r.body.complejos[0]).toMatchObject({ telefono: '6017654321', descripcion: 'Canchas nuevas' });
  });

  it('aprobar y rechazar a la vez: solo una resolución gana', async () => {
    const { body } = await api().post('/api/complejos').set(admin.auth).send(complejoBase).expect(201);
    const url = `/api/complejos/${body.complejo.id}/aprobacion`;
    const [a, b] = await Promise.all([
      api().patch(url).set(superadmin.auth).send({ aprobar: true }),
      api().patch(url).set(superadmin.auth).send({ aprobar: false, motivo: 'Duplicado' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('editar el complejo conserva las coordenadas enviadas', async () => {
    const { body } = await api().post('/api/complejos').set(admin.auth).send({ ...complejoBase, latitud: 4.7, longitud: -74.03 }).expect(201);
    const r = await api().put(`/api/complejos/${body.complejo.id}`).set(admin.auth).send({ ...complejoBase, nombre: 'Nuevo', latitud: 4.7, longitud: -74.03 }).expect(200);
    expect(r.body.complejo).toMatchObject({ nombre: 'Nuevo', latitud: 4.7, longitud: -74.03 });
  });

  it('400 si faltan datos obligatorios o un servicio no existe', async () => {
    const r = await api().post('/api/complejos').set(admin.auth).send({ nombre: 'X' }).expect(400);
    const campos = r.body.error.detalles.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['direccion', 'ciudad', 'barrio', 'telefono']));
    await api().post('/api/complejos').set(admin.auth).send({ ...complejoBase, servicioIds: [999] }).expect(400);
  });

  it('otro administrador no puede modificar un complejo ajeno (RNF-02)', async () => {
    const { body } = await api().post('/api/complejos').set(admin.auth).send(complejoBase).expect(201);
    const otro = await crearUsuario({ rol: 'AdminComplejo' });
    await api().put(`/api/complejos/${body.complejo.id}`).set(otro.auth).send(complejoBase).expect(403);
    await api().post(`/api/complejos/${body.complejo.id}/canchas`).set(otro.auth).send({ nombre: 'C', tipoFutbol: 5, superficie: 'S' }).expect(403);
  });

  it('fotos solo por https', async () => {
    const { body } = await api().post('/api/complejos').set(admin.auth).send(complejoBase).expect(201);
    await api().post(`/api/complejos/${body.complejo.id}/fotos`).set(admin.auth).send({ url: 'http://inseguro.co/a.png' }).expect(400);
    const f = await api().post(`/api/complejos/${body.complejo.id}/fotos`).set(admin.auth).send({ url: 'https://img.co/a.png' }).expect(201);
    await api().delete(`/api/complejos/${body.complejo.id}/fotos/${f.body.foto.id}`).set(admin.auth).expect(204);
  });
});

describe('HU-06 · canchas', () => {
  it('cada cancha se asocia al complejo; los nombres no se repiten; desactivarla la oculta pero la conserva', async () => {
    const { complejoId, canchaId } = await crearComplejoActivo(admin);
    const dup = await api()
      .post(`/api/complejos/${complejoId}/canchas`)
      .set(admin.auth)
      .send({ nombre: 'Cancha 1', tipoFutbol: 7, superficie: 'Sintética' })
      .expect(409);
    expect(dup.body.error.codigo).toBe('CANCHA_DUPLICADA');

    const c2 = await api()
      .post(`/api/complejos/${complejoId}/canchas`)
      .set(admin.auth)
      .send({ nombre: 'Cancha 2', tipoFutbol: 7, superficie: 'Sintética', techada: true })
      .expect(201);
    expect(c2.body.cancha).toMatchObject({ tipoFutbol: 7, capacidadJugadores: 14, techada: true, estado: 'activa' });

    let detalle = await api().get(`/api/complejos/${complejoId}`).expect(200);
    expect(detalle.body.canchas).toHaveLength(2);

    await api()
      .put(`/api/canchas/${canchaId}`)
      .set(admin.auth)
      .send({ nombre: 'Cancha 1', tipoFutbol: 5, superficie: 'Sintética', estado: 'inactiva' })
      .expect(200);
    detalle = await api().get(`/api/complejos/${complejoId}`).expect(200);
    expect(detalle.body.canchas.map((c: { nombre: string }) => c.nombre)).toEqual(['Cancha 2']);
    const comoDueno = await api().get(`/api/complejos/${complejoId}`).set(admin.auth).expect(200);
    expect(comoDueno.body.canchas).toHaveLength(2);
    // Filtrar por tipo usa solo canchas activas.
    expect((await api().get('/api/complejos?tipoFutbol=5').expect(200)).body.total).toBe(0);
    expect((await api().get('/api/complejos?tipoFutbol=7').expect(200)).body.total).toBe(1);
  });

  it('400 con un tipo de fútbol inválido', async () => {
    const { complejoId } = await crearComplejoActivo(admin);
    await api().post(`/api/complejos/${complejoId}/canchas`).set(admin.auth).send({ nombre: 'X', tipoFutbol: 9, superficie: 'S' }).expect(400);
  });
});

describe('HU-07 · horarios de atención', () => {
  it('genera las franjas 8:00-9:00 ... 22:00-23:00 con turnos de 60 minutos', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    const r = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${proximo(2)}`).expect(200);
    expect(r.body.franjas).toHaveLength(15);
    expect(r.body.franjas[0]).toMatchObject({ horaInicio: '08:00', horaFin: '09:00', estado: 'libre' });
    expect(r.body.franjas.at(-1)).toMatchObject({ horaInicio: '22:00', horaFin: '23:00' });
  });

  it('una fecha especial reemplaza al horario habitual solo en esa fecha', async () => {
    const { complejoId, canchaId } = await crearComplejoActivo(admin);
    const martes = proximo(2);
    await api()
      .post(`/api/complejos/${complejoId}/horarios-especiales`)
      .set(admin.auth)
      .send({ fecha: martes, horaApertura: '10:00', horaCierre: '14:00', duracionTurnoMin: 60 })
      .expect(200);
    const especial = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${martes}`).expect(200);
    expect(especial.body.franjas.map((f: { horaInicio: string }) => f.horaInicio)).toEqual(['10:00', '11:00', '12:00', '13:00']);
    const siguiente = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${sumarDias(martes, 7)}`).expect(200);
    expect(siguiente.body.franjas).toHaveLength(15);
    await api().delete(`/api/complejos/${complejoId}/horarios-especiales/${martes}`).set(admin.auth).expect(204);
  });

  it('una fecha especial puede marcarse como cerrada (p. ej. festivo) y avisa de reservas en ese día', async () => {
    const { complejoId, canchaId } = await crearComplejoActivo(admin);
    const martes = proximo(2);
    const reserva = { id: 3, codigo: 'CY-CERRADO1', canchaId, fecha: martes, horaInicio: '15:00', horaFin: '16:00' };
    registrarConsultaReservas(async () => [reserva]);
    const r = await api()
      .post(`/api/complejos/${complejoId}/horarios-especiales`)
      .set(admin.auth)
      .send({ fecha: martes, cerrado: true })
      .expect(200);
    expect(r.body.horarios.find((h: { fechaEspecial: string | null }) => h.fechaEspecial === martes)).toMatchObject({
      cerrado: true,
      horaApertura: null,
      horaCierre: null,
      duracionTurnoMin: null,
    });
    expect(r.body.advertencias.reservasFueraDeHorario).toEqual([reserva]);
    const franjas = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${martes}`).expect(200);
    expect(franjas.body.franjas).toEqual([]);
    // Volver a abrir ese día con otro horario reemplaza el cierre.
    await api()
      .post(`/api/complejos/${complejoId}/horarios-especiales`)
      .set(admin.auth)
      .send({ fecha: martes, cerrado: false, horaApertura: '09:00', horaCierre: '12:00', duracionTurnoMin: 60 })
      .expect(200);
    expect((await api().get(`/api/canchas/${canchaId}/franjas?fecha=${martes}`).expect(200)).body.franjas).toHaveLength(3);
  });

  it('400 si una fecha abierta no trae horas', async () => {
    const { complejoId } = await crearComplejoActivo(admin);
    await api().post(`/api/complejos/${complejoId}/horarios-especiales`).set(admin.auth).send({ fecha: proximo(3), cerrado: false }).expect(400);
  });

  it('al cambiar el horario avisa de las reservas que quedan fuera y no las elimina', async () => {
    const { complejoId, canchaId } = await crearComplejoActivo(admin);
    const martes = proximo(2);
    const reserva = { id: 1, codigo: 'CY-PRUEBA01', canchaId, fecha: martes, horaInicio: '08:00', horaFin: '09:00' };
    registrarConsultaReservas(async () => [reserva]);
    const r = await api()
      .put(`/api/complejos/${complejoId}/horarios`)
      .set(admin.auth)
      .send({ dias: [{ diaSemana: 2, horaApertura: '10:00', horaCierre: '22:00', duracionTurnoMin: 60 }] })
      .expect(200);
    expect(r.body.advertencias.reservasFueraDeHorario).toEqual([reserva]);
    expect(r.body.horarios.filter((h: { diaSemana: number | null }) => h.diaSemana !== null)).toHaveLength(1);
  });

  it('400 si el cierre no es posterior a la apertura o un día se repite', async () => {
    const { complejoId } = await crearComplejoActivo(admin);
    await api()
      .put(`/api/complejos/${complejoId}/horarios`)
      .set(admin.auth)
      .send({ dias: [{ diaSemana: 1, horaApertura: '20:00', horaCierre: '10:00', duracionTurnoMin: 60 }] })
      .expect(400);
    await api()
      .put(`/api/complejos/${complejoId}/horarios`)
      .set(admin.auth)
      .send({
        dias: [
          { diaSemana: 1, horaApertura: '08:00', horaCierre: '10:00', duracionTurnoMin: 60 },
          { diaSemana: 1, horaApertura: '12:00', horaCierre: '14:00', duracionTurnoMin: 60 },
        ],
      })
      .expect(400);
  });
});

describe('HU-08 · tarifas', () => {
  it('precio diurno y nocturno desde las 18:00; fin de semana con su propia tarifa', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    await api().post(`/api/canchas/${canchaId}/tarifas`).set(admin.auth).send({ tipoDia: 'fin_semana_festivo', horaInicio: '08:00', horaFin: '23:00', precio: 150000 }).expect(201);

    const martes = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${proximo(2)}`).expect(200);
    const precio = (franjas: { horaInicio: string; precio: number }[], hora: string) => franjas.find((f) => f.horaInicio === hora)?.precio;
    expect(precio(martes.body.franjas, '17:00')).toBe(80000);
    expect(precio(martes.body.franjas, '18:00')).toBe(120000);

    const sabado = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${proximo(6)}`).expect(200);
    expect(precio(sabado.body.franjas, '10:00')).toBe(150000);
  });

  it('409 si una tarifa se cruza con otra activa del mismo tipo de día', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    const r = await api().post(`/api/canchas/${canchaId}/tarifas`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '17:00', horaFin: '19:00', precio: 90000 }).expect(409);
    expect(r.body.error.codigo).toBe('TARIFA_CRUZADA');
  });

  it('cambiar una tarifa crea una nueva y desactiva la anterior (RN-04: las reservas guardan su precio)', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    const lista = await api().get(`/api/canchas/${canchaId}/tarifas`).expect(200);
    const diurna = lista.body.tarifas.find((t: { horaInicio: string }) => t.horaInicio === '08:00');
    const r = await api().put(`/api/tarifas/${diurna.id}`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '08:00', horaFin: '18:00', precio: 90000 }).expect(200);
    expect(r.body.tarifa.id).not.toBe(diurna.id);
    const historial = await query<{ activa: boolean }>('SELECT activa FROM tarifa WHERE id = $1', [diurna.id]);
    expect(historial[0]!.activa).toBe(false);
    const franjas = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${proximo(2)}`).expect(200);
    expect(franjas.body.franjas[0].precio).toBe(90000);
  });

  it('400 con precio no positivo o con decimales', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    await api().post(`/api/canchas/${canchaId}/tarifas`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '06:00', horaFin: '07:00', precio: 0 }).expect(400);
    await api().post(`/api/canchas/${canchaId}/tarifas`).set(admin.auth).send({ tipoDia: 'semana', horaInicio: '06:00', horaFin: '07:00', precio: 10.5 }).expect(400);
  });
});

describe('HU-09 · bloqueos', () => {
  it('las franjas bloqueadas por mantenimiento aparecen como no disponibles', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    const sabado = proximo(6);
    await api()
      .post(`/api/canchas/${canchaId}/bloqueos`)
      .set(admin.auth)
      .send({ fechaInicio: `${sabado}T08:00`, fechaFin: `${sabado}T12:00`, motivo: 'Mantenimiento' })
      .expect(201);
    const r = await api().get(`/api/canchas/${canchaId}/franjas?fecha=${sabado}`).expect(200);
    const estados = r.body.franjas.slice(0, 5).map((f: { estado: string }) => f.estado);
    expect(estados).toEqual(['bloqueada', 'bloqueada', 'bloqueada', 'bloqueada', 'libre']);
    const lista = await api().get(`/api/canchas/${canchaId}/bloqueos`).set(admin.auth).expect(200);
    expect(lista.body.bloqueos[0]).toMatchObject({ fechaInicio: `${sabado}T08:00`, fechaFin: `${sabado}T12:00`, motivo: 'Mantenimiento' });
  });

  it('409 si hay una reserva activa en el rango, indicando cuál', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    const sabado = proximo(6);
    const reserva = { id: 7, codigo: 'CY-ABCDEFGH', canchaId, fecha: sabado, horaInicio: '10:00', horaFin: '11:00' };
    registrarConsultaReservas(async ({ canchaId: c }) => (c === canchaId ? [reserva] : []));
    const r = await api()
      .post(`/api/canchas/${canchaId}/bloqueos`)
      .set(admin.auth)
      .send({ fechaInicio: `${sabado}T08:00`, fechaFin: `${sabado}T12:00`, motivo: 'Mantenimiento' })
      .expect(409);
    expect(r.body.error.codigo).toBe('BLOQUEO_CON_RESERVAS');
    expect(r.body.error.datos.reservas).toEqual([reserva]);
    // Un rango que no toca la reserva sí se puede bloquear.
    await api()
      .post(`/api/canchas/${canchaId}/bloqueos`)
      .set(admin.auth)
      .send({ fechaInicio: `${sabado}T11:00`, fechaFin: `${sabado}T12:00`, motivo: 'Evento privado' })
      .expect(201);
  });

  it('400 (no 500) si el rango de consulta está invertido', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    const r = await api().get(`/api/canchas/${canchaId}/bloqueos?desde=2026-12-10&hasta=2026-12-01`).set(admin.auth).expect(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
  });

  it('400 si el fin no es posterior al inicio o el bloqueo ya pasó', async () => {
    const { canchaId } = await crearComplejoActivo(admin);
    const sabado = proximo(6);
    await api().post(`/api/canchas/${canchaId}/bloqueos`).set(admin.auth).send({ fechaInicio: `${sabado}T12:00`, fechaFin: `${sabado}T08:00`, motivo: 'X' }).expect(400);
    await api().post(`/api/canchas/${canchaId}/bloqueos`).set(admin.auth).send({ fechaInicio: '2020-01-01T08:00', fechaFin: '2020-01-01T09:00', motivo: 'X' }).expect(400);
  });
});

describe('búsqueda de complejos', () => {
  it('filtra por ciudad, texto y servicio, y pagina', async () => {
    const otro = await crearUsuario({ rol: 'AdminComplejo' });
    await crearComplejoActivo(admin, { nombre: 'La Bombonera', ciudad: 'Cali' });
    await crearComplejoActivo(otro, { nombre: 'El Templo', ciudad: 'Medellín' });
    expect((await api().get('/api/complejos?ciudad=cali').expect(200)).body.complejos.map((c: { nombre: string }) => c.nombre)).toEqual(['La Bombonera']);
    expect((await api().get('/api/complejos?q=templo').expect(200)).body.total).toBe(1);
    expect((await api().get('/api/complejos?servicio=3').expect(200)).body.total).toBe(0);
    const pagina = await api().get('/api/complejos?tamano=1&pagina=2').expect(200);
    expect(pagina.body).toMatchObject({ total: 2, pagina: 2, tamano: 1 });
    expect(pagina.body.complejos).toHaveLength(1);
    expect(pagina.body.complejos[0].precioDesde).toBe(80000);
  });

  it('el texto de búsqueda no permite inyección SQL', async () => {
    await crearComplejoActivo(admin);
    const r = await api().get(`/api/complejos?q=${encodeURIComponent("' OR 1=1 --")}`).expect(200);
    expect(r.body.total).toBe(0);
    const comodin = await api().get(`/api/complejos?q=${encodeURIComponent('%')}`).expect(200);
    expect(comodin.body.total).toBe(0);
  });
});
