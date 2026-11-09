import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Input } from '../../../components/ui';
import { hoyBogota } from '../../../lib/format';
import { rutaInicialPorRol, useAuth } from '../AuthContext';
import {
  erroresDeApi,
  limpiar,
  validarCelular,
  validarContrasena,
  validarCorreo,
  validarObligatorio,
  validarUsername,
} from '../validation';
import type { Errores } from '../validation';

const VACIO = {
  nombres: '',
  apellidos: '',
  username: '',
  correo: '',
  celular: '',
  fechaNacimiento: '',
  contrasena: '',
};

export function RegisterPage() {
  const { usuario, registrarse } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState(VACIO);
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: () =>
      registrarse({
        nombres: f.nombres.trim(),
        apellidos: f.apellidos.trim(),
        username: f.username.trim(),
        correo: f.correo.trim(),
        celular: f.celular.trim(),
        fechaNacimiento: f.fechaNacimiento,
        contrasena: f.contrasena,
        aceptaTratamientoDatos: true,
      }),
    onSuccess: (u) => void navigate(rutaInicialPorRol(u), { replace: true }),
    onError: (e) => {
      const r = erroresDeApi(e);
      setErrores(r.campos);
      setGeneral(r.general);
    },
  });

  if (usuario && !mutacion.isPending && !mutacion.isSuccess) return <Navigate to={rutaInicialPorRol(usuario)} replace />;

  const campo = (k: keyof typeof VACIO) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value })),
    error: errores[k],
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const nuevos = limpiar({
      nombres: validarObligatorio(f.nombres, 'Los nombres'),
      apellidos: validarObligatorio(f.apellidos, 'Los apellidos'),
      username: validarUsername(f.username.trim()),
      correo: validarCorreo(f.correo.trim()),
      celular: validarCelular(f.celular.trim()),
      fechaNacimiento: !f.fechaNacimiento
        ? 'Ingresa tu fecha de nacimiento.'
        : f.fechaNacimiento >= hoyBogota()
          ? 'La fecha de nacimiento debe estar en el pasado.'
          : undefined,
      contrasena: validarContrasena(f.contrasena),
      aceptaTratamientoDatos: acepta ? undefined : 'Debes aceptar el tratamiento de tus datos para registrarte.',
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length === 0) mutacion.mutate();
  }

  return (
    <div className="page page--narrow">
      <Card>
        <h1>Crear cuenta</h1>
        <form onSubmit={enviar} noValidate className="form">
          {general && <Alert tone="error">{general}</Alert>}
          <div className="form__row">
            <Input label="Nombres" autoComplete="given-name" {...campo('nombres')} />
            <Input label="Apellidos" autoComplete="family-name" {...campo('apellidos')} />
          </div>
          <Input label="Nombre de usuario" autoComplete="username" hint="3 a 30 caracteres: letras, números, _ y ." {...campo('username')} />
          <Input label="Correo electrónico" type="email" autoComplete="email" {...campo('correo')} />
          <Input label="Celular" type="tel" autoComplete="tel" inputMode="tel" hint="Entre 7 y 15 dígitos, puede iniciar con +" {...campo('celular')} />
          <Input label="Fecha de nacimiento" type="date" max={hoyBogota()} autoComplete="bday" {...campo('fechaNacimiento')} />
          <Input label="Contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con al menos una letra y un número." {...campo('contrasena')} />

          <div className="check">
            <label className="check__label">
              <input
                type="checkbox"
                checked={acepta}
                onChange={(e) => setAcepta(e.target.checked)}
                aria-invalid={errores.aceptaTratamientoDatos ? true : undefined}
                aria-describedby="acepta-ayuda"
              />
              <span>Acepto los términos y el tratamiento de mis datos personales (Ley 1581 de 2012)</span>
            </label>
            <p id="acepta-ayuda" className="field__hint">
              Usaremos tus datos solo para gestionar tu cuenta y tus reservas. Puedes consultarlos y corregirlos en tu perfil.
            </p>
            {errores.aceptaTratamientoDatos && <p className="field__error">{errores.aceptaTratamientoDatos}</p>}
          </div>

          <Button type="submit" block loading={mutacion.isPending}>
            Crear cuenta
          </Button>
        </form>
        <p className="form__links">
          <span>
            ¿Ya tienes cuenta? <Link to="/ingresar">Ingresa</Link>
          </span>
        </p>
      </Card>
    </div>
  );
}
