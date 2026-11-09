/** Pruebas de integración de EP-01 (criterios de HU-01 a HU-04, HT-04, HT-13). */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, CONTRASENA, crearUsuario, limpiarBd, pool, query, tokenDelCorreo } from '../helpers/api';

const datosRegistro = {
  nombres: 'Carlos',
  apellidos: 'Pérez',
  username: 'carlitos10',
  correo: 'Carlos@Prueba.co',
  celular: '+573001234567',
  fechaNacimiento: '1999-07-15',
  contrasena: 'Futbol2026',
  aceptaTratamientoDatos: true,
};

beforeEach(limpiarBd);
afterAll(() => pool.end());

describe('POST /api/auth/registro (HU-01)', () => {
  it('201: crea la cuenta como Jugador, devuelve sesión y nunca la contraseña', async () => {
    const r = await api().post('/api/auth/registro').send(datosRegistro).expect(201);
    expect(r.body.usuario).toMatchObject({ correo: 'carlos@prueba.co', rol: 'Jugador', correoVerificado: false });
    expect(r.body.token).toEqual(expect.any(String));
    expect(JSON.stringify(r.body)).not.toMatch(/contrasena|Futbol2026|hash/i);
  });

  it('409: "El correo ya está en uso"', async () => {
    await api().post('/api/auth/registro').send(datosRegistro).expect(201);
    const r = await api().post('/api/auth/registro').send({ ...datosRegistro, username: 'otro' }).expect(409);
    expect(r.body.error).toEqual({ codigo: 'CORREO_EN_USO', mensaje: 'El correo ya está en uso' });
  });

  it.each([
    ['menos de 8 caracteres', 'Abc123'],
    ['sin números', 'SoloLetras'],
    ['sin letras', '12345678'],
  ])('400: contraseña %s y no se crea la cuenta (HU-01 criterio 3)', async (_caso, contrasena) => {
    const r = await api().post('/api/auth/registro').send({ ...datosRegistro, contrasena }).expect(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
    expect(r.body.error.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'contrasena' })]));
    const filas = await query('SELECT 1 FROM usuario');
    expect(filas).toHaveLength(0);
  });

  it('400: exige aceptar el tratamiento de datos (Ley 1581, RNF-03)', async () => {
    const r = await api().post('/api/auth/registro').send({ ...datosRegistro, aceptaTratamientoDatos: false }).expect(400);
    expect(r.body.error.detalles[0].campo).toBe('aceptaTratamientoDatos');
  });

  it('400: JSON mal formado responde con un error claro', async () => {
    const r = await api().post('/api/auth/registro').set('Content-Type', 'application/json').send('{"mal').expect(400);
    expect(r.body.error.codigo).toBe('JSON_INVALIDO');
  });
});

describe('verificación de correo (HU-01 criterio 4)', () => {
  it('el enlace del correo confirma la cuenta', async () => {
    const r = await api().post('/api/auth/registro').send(datosRegistro).expect(201);
    const token = tokenDelCorreo('carlos@prueba.co');
    await api().post('/api/auth/verificar-correo').send({ token }).expect(204);
    const yo = await api().get('/api/auth/yo').set('Authorization', `Bearer ${r.body.token}`).expect(200);
    expect(yo.body.usuario.correoVerificado).toBe(true);
    // Un solo uso.
    const otra = await api().post('/api/auth/verificar-correo').send({ token }).expect(400);
    expect(otra.body.error.codigo).toBe('TOKEN_INVALIDO');
  });
});

describe('POST /api/auth/login (HU-02, HT-04)', () => {
  it('200: devuelve el token y el usuario con su rol', async () => {
    await crearUsuario({ correo: 'admin@prueba.co', rol: 'AdminComplejo' });
    const r = await api().post('/api/auth/login').send({ correo: 'ADMIN@prueba.co', contrasena: CONTRASENA }).expect(200);
    expect(r.body.usuario.rol).toBe('AdminComplejo');
    expect(r.body.expiraEn).toBe(7200);
  });

  it('401 con credenciales incorrectas, 403 al quinto intento fallido', async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    for (let i = 0; i < 4; i++) {
      const r = await api().post('/api/auth/login').send({ correo: 'ana@prueba.co', contrasena: 'incorrecta1' }).expect(401);
      expect(r.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    }
    const r = await api().post('/api/auth/login').send({ correo: 'ana@prueba.co', contrasena: 'incorrecta1' }).expect(403);
    expect(r.body.error.codigo).toBe('CUENTA_BLOQUEADA');
    await api().post('/api/auth/login').send({ correo: 'ana@prueba.co', contrasena: CONTRASENA }).expect(403);
  });

  it('429: límite de peticiones por minuto en el inicio de sesión (HT-13)', async () => {
    const respuestas = [];
    for (let i = 0; i < 11; i++) {
      respuestas.push((await api().post('/api/auth/login').send({ correo: 'nadie@prueba.co', contrasena: 'x' })).status);
    }
    expect(respuestas.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(respuestas[10]).toBe(429);
  });

  it('logout responde 204 (el cliente descarta el token)', async () => {
    await api().post('/api/auth/logout').expect(204);
  });
});

describe('sesión y autorización (HT-04)', () => {
  it('401 sin token, con token alterado o de un usuario inexistente', async () => {
    await api().get('/api/auth/yo').expect(401);
    const u = await crearUsuario();
    await api().get('/api/auth/yo').set('Authorization', `Bearer ${u.token}x`).expect(401);
    await query('DELETE FROM usuario WHERE id = $1', [u.id]);
    await api().get('/api/auth/yo').set(u.auth).expect(401);
  });

  it('rechaza tokens con algoritmo "none"', async () => {
    const u = await crearUsuario();
    const [, payload] = u.token.split('.');
    const sinFirma = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    await api().get('/api/auth/yo').set('Authorization', `Bearer ${sinFirma}`).expect(401);
  });

  it('una suspensión aplica de inmediato aunque el token siga vigente', async () => {
    const u = await crearUsuario();
    await api().get('/api/auth/yo').set(u.auth).expect(200);
    await query("UPDATE usuario SET estado = 'suspendido' WHERE id = $1", [u.id]);
    const r = await api().get('/api/auth/yo').set(u.auth).expect(403);
    expect(r.body.error.codigo).toBe('CUENTA_INACTIVA');
  });

  it('un jugador no puede usar rutas de administrador ni de superadministrador (403)', async () => {
    const jugador = await crearUsuario();
    await api().put('/api/complejos/1').set(jugador.auth).send({}).expect(403);
    const mios = await api().get('/api/mis-complejos').set(jugador.auth).expect(200);
    expect(mios.body.complejos).toEqual([]);
    await api().get('/api/complejos/pendientes').set(jugador.auth).expect(403);
  });
});

describe('recuperar contraseña (HU-03)', () => {
  it('202 con el mismo mensaje exista o no el correo; el enlace permite cambiar la contraseña', async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    const a = await api().post('/api/auth/recuperar-contrasena').send({ correo: 'ana@prueba.co' }).expect(202);
    const b = await api().post('/api/auth/recuperar-contrasena').send({ correo: 'nadie@prueba.co' }).expect(202);
    expect(a.body).toEqual(b.body);

    const token = tokenDelCorreo('ana@prueba.co');
    await api().post('/api/auth/restablecer-contrasena').send({ token, contrasena: 'NuevaClave7' }).expect(204);
    await api().post('/api/auth/login').send({ correo: 'ana@prueba.co', contrasena: 'NuevaClave7' }).expect(200);
  });

  it('400 TOKEN_EXPIRADO cuando el enlace venció', async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    await api().post('/api/auth/recuperar-contrasena').send({ correo: 'ana@prueba.co' }).expect(202);
    const token = tokenDelCorreo('ana@prueba.co');
    await query("UPDATE token_usuario SET fecha_expiracion = now() - interval '1 minute'");
    const r = await api().post('/api/auth/restablecer-contrasena').send({ token, contrasena: 'NuevaClave7' }).expect(400);
    expect(r.body.error).toMatchObject({ codigo: 'TOKEN_EXPIRADO', mensaje: 'El enlace expiró. Solicita uno nuevo.' });
  });

  it('guarda solo el hash del token, nunca el token en claro', async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    await api().post('/api/auth/recuperar-contrasena').send({ correo: 'ana@prueba.co' }).expect(202);
    const token = tokenDelCorreo('ana@prueba.co');
    const filas = await query<{ token_hash: string }>('SELECT token_hash FROM token_usuario');
    expect(filas[0]!.token_hash).not.toBe(token);
    expect(filas[0]!.token_hash).toHaveLength(64);
  });
});

describe('perfil (HU-04)', () => {
  it('guarda posición y nivel y los muestra en el perfil público sin correo ni celular', async () => {
    const u = await crearUsuario({ username: 'el_arquero' });
    await api()
      .put('/api/auth/yo')
      .set(u.auth)
      .send({ nombres: 'Pedro', apellidos: 'Ruiz', celular: '3005556677', fotoUrl: 'https://img.ejemplo.co/p.png', posicionPreferida: 'arquero', nivel: 'avanzado' })
      .expect(200);
    const r = await api().get('/api/usuarios/el_arquero').expect(200);
    expect(r.body.perfil).toMatchObject({ username: 'el_arquero', posicionPreferida: 'arquero', nivel: 'avanzado', partidosJugados: 0, equipos: [] });
    expect(r.body.perfil).not.toHaveProperty('correo');
    expect(r.body.perfil).not.toHaveProperty('celular');
    expect(JSON.stringify(r.body)).not.toContain('3005556677');
  });

  it('400 con posición o nivel inválidos o una foto que no es https', async () => {
    const u = await crearUsuario();
    const r = await api()
      .put('/api/auth/yo')
      .set(u.auth)
      .send({ nombres: 'P', apellidos: 'R', celular: '3005556677', fotoUrl: 'javascript:alert(1)', posicionPreferida: 'portero', nivel: 'pro' })
      .expect(400);
    const campos = r.body.error.detalles.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['fotoUrl', 'posicionPreferida', 'nivel']));
  });

  it('cambiar contraseña exige la actual, cierra las otras sesiones y entrega un token nuevo', async () => {
    const u = await crearUsuario();
    await api().put('/api/auth/yo/contrasena').set(u.auth).send({ actual: 'mala', nueva: 'NuevaClave1' }).expect(400);
    // El token viejo debe tener un `iat` anterior al cambio.
    await new Promise((r) => setTimeout(r, 1100));
    const r = await api().put('/api/auth/yo/contrasena').set(u.auth).send({ actual: CONTRASENA, nueva: 'NuevaClave1' }).expect(200);
    expect(r.body.token).toEqual(expect.any(String));
    await api().get('/api/auth/yo').set(u.auth).expect(401);
    await api().get('/api/auth/yo').set('Authorization', `Bearer ${r.body.token}`).expect(200);
  });

  it('restablecer la contraseña invalida los tokens emitidos antes (M3)', async () => {
    const u = await crearUsuario({ correo: 'robada@prueba.co' });
    await new Promise((r) => setTimeout(r, 1100));
    await api().post('/api/auth/recuperar-contrasena').send({ correo: 'robada@prueba.co' }).expect(202);
    await api().post('/api/auth/restablecer-contrasena').send({ token: tokenDelCorreo('robada@prueba.co'), contrasena: 'OtraClave55' }).expect(204);
    await api().get('/api/auth/yo').set(u.auth).expect(401);
  });

  it('404 para un jugador inexistente', async () => {
    const r = await api().get('/api/usuarios/no_existe').expect(404);
    expect(r.body.error.codigo).toBe('USUARIO_NO_ENCONTRADO');
  });
});

describe('cabeceras de seguridad y errores (HT-13, HT-14)', () => {
  it('aplica Helmet, oculta x-powered-by y responde 404 en JSON', async () => {
    const r = await api().get('/api/no-existe').expect(404);
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.body.error.codigo).toBe('RUTA_NO_ENCONTRADA');
  });

  it('CORS solo permite el origen del frontend', async () => {
    const ok = await api().get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const malo = await api().get('/api/health').set('Origin', 'https://sitio-malicioso.com');
    expect(malo.headers['access-control-allow-origin']).toBeUndefined();
  });
});
