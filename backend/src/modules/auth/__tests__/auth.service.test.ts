import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTRASENA, correos, crearUsuario, limpiarBd, pool, queryOne, tokenDelCorreo } from '../../../../tests/helpers/api';
import { AppError } from '../../../shared/errors/AppError';
import { verificarToken } from '../../../shared/security/jwt';
import { authService, MAX_INTENTOS, MINUTOS_BLOQUEO } from '../auth.service';

const registro = {
  nombres: 'Laura',
  apellidos: 'Gómez',
  username: 'laura_g',
  correo: 'laura@prueba.co',
  celular: '3001112233',
  fechaNacimiento: '1998-03-21',
  contrasena: 'Segura123',
  aceptaTratamientoDatos: true as const,
};

async function esperarError(promesa: Promise<unknown>, codigo: string): Promise<AppError> {
  try {
    await promesa;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).codigo).toBe(codigo);
    return err as AppError;
  }
  throw new Error(`Se esperaba el error ${codigo}`);
}

beforeEach(limpiarBd);
afterAll(() => pool.end());

describe('authService.registrar (HU-01)', () => {
  it('crea la cuenta con rol Jugador, guarda la contraseña con hash y envía el correo de verificación', async () => {
    const sesion = await authService.registrar(registro);
    expect(sesion.usuario).toMatchObject({ rol: 'Jugador', correo: 'laura@prueba.co', correoVerificado: false });
    expect(verificarToken(sesion.token)?.usuarioId).toBe(sesion.usuario.id);
    expect(sesion.expiraEn).toBe(2 * 60 * 60); // HT-04: 2 horas

    const fila = await queryOne<{ contrasena_hash: string }>('SELECT contrasena_hash FROM usuario WHERE id = $1', [sesion.usuario.id]);
    expect(fila!.contrasena_hash).not.toContain('Segura123');
    expect(fila!.contrasena_hash).toMatch(/^\$2[aby]\$/);
    expect(correos.ultimoPara('laura@prueba.co')?.asunto).toMatch(/Confirma tu correo/);
  });

  it('rechaza un correo ya registrado (sin distinguir mayúsculas)', async () => {
    await authService.registrar(registro);
    const err = await esperarError(authService.registrar({ ...registro, username: 'otra' }), 'CORREO_EN_USO');
    expect(err.message).toBe('El correo ya está en uso');
  });

  it('rechaza un nombre de usuario ya registrado', async () => {
    await authService.registrar(registro);
    await esperarError(authService.registrar({ ...registro, correo: 'otra@prueba.co', username: 'LAURA_G' }), 'USERNAME_EN_USO');
  });
});

describe('authService.iniciarSesion (HU-02)', () => {
  it('inicia sesión con credenciales correctas', async () => {
    const u = await crearUsuario({ correo: 'ana@prueba.co' });
    const s = await authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: CONTRASENA });
    expect(s.usuario.id).toBe(u.id);
  });

  it('no revela si el correo existe', async () => {
    await esperarError(authService.iniciarSesion({ correo: 'nadie@prueba.co', contrasena: 'x' }), 'CREDENCIALES_INVALIDAS');
  });

  it(`bloquea la cuenta ${MINUTOS_BLOQUEO} minutos tras ${MAX_INTENTOS} intentos fallidos seguidos`, async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    const ahora = new Date();
    for (let i = 1; i < MAX_INTENTOS; i++) {
      await esperarError(authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: 'mala' }, ahora), 'CREDENCIALES_INVALIDAS');
    }
    await esperarError(authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: 'mala' }, ahora), 'CUENTA_BLOQUEADA');
    // Aun con la contraseña correcta sigue bloqueada.
    const err = await esperarError(authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: CONTRASENA }, ahora), 'CUENTA_BLOQUEADA');
    expect(err.message).toMatch(/15 minutos/);
    // Pasados los 15 minutos puede volver a ingresar.
    const despues = new Date(ahora.getTime() + (MINUTOS_BLOQUEO * 60 + 1) * 1000);
    await expect(authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: CONTRASENA }, despues)).resolves.toBeTruthy();
  });

  it('un ingreso correcto reinicia el contador de intentos', async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    for (let i = 1; i < MAX_INTENTOS; i++) {
      await esperarError(authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: 'mala' }), 'CREDENCIALES_INVALIDAS');
    }
    await authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: CONTRASENA });
    await esperarError(authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: 'mala' }), 'CREDENCIALES_INVALIDAS');
  });

  it('una cuenta suspendida no puede ingresar', async () => {
    await crearUsuario({ correo: 'ana@prueba.co', estado: 'suspendido' });
    await esperarError(authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: CONTRASENA }), 'CUENTA_INACTIVA');
  });
});

describe('recuperación de contraseña (HU-03)', () => {
  it('envía un enlace de un solo uso que permite cambiar la contraseña', async () => {
    const u = await crearUsuario({ correo: 'ana@prueba.co' });
    const r = await authService.solicitarRecuperacion('ana@prueba.co');
    expect(r.mensaje).toMatch(/Si el correo está registrado/);
    const token = tokenDelCorreo('ana@prueba.co');

    await authService.restablecerContrasena(token, 'NuevaClave9');
    const s = await authService.iniciarSesion({ correo: 'ana@prueba.co', contrasena: 'NuevaClave9' });
    expect(s.usuario.id).toBe(u.id);
    await esperarError(authService.restablecerContrasena(token, 'OtraClave9'), 'TOKEN_INVALIDO');
  });

  it('el enlace vence a los 30 minutos y pide solicitar uno nuevo', async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    await authService.solicitarRecuperacion('ana@prueba.co');
    const token = tokenDelCorreo('ana@prueba.co');
    const en31Minutos = new Date(Date.now() + 31 * 60_000);
    const err = await esperarError(authService.restablecerContrasena(token, 'NuevaClave9', en31Minutos), 'TOKEN_EXPIRADO');
    expect(err.message).toMatch(/Solicita uno nuevo/);
  });

  it('responde igual si el correo no existe y no envía nada', async () => {
    const r = await authService.solicitarRecuperacion('nadie@prueba.co');
    expect(r.mensaje).toMatch(/Si el correo está registrado/);
    expect(correos.enviados).toHaveLength(0);
  });

  it('un enlace nuevo invalida el anterior', async () => {
    await crearUsuario({ correo: 'ana@prueba.co' });
    await authService.solicitarRecuperacion('ana@prueba.co');
    const primero = tokenDelCorreo('ana@prueba.co');
    await authService.solicitarRecuperacion('ana@prueba.co');
    await esperarError(authService.restablecerContrasena(primero, 'NuevaClave9'), 'TOKEN_INVALIDO');
  });
});

describe('verificación de correo (HU-01 criterio 4)', () => {
  it('marca el correo como verificado con el enlace recibido', async () => {
    const s = await authService.registrar(registro);
    await authService.verificarCorreo(tokenDelCorreo('laura@prueba.co'));
    expect((await authService.obtenerUsuario(s.usuario.id)).correoVerificado).toBe(true);
  });
});
