import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Input } from '../../../components/ui';
import { rutaInicialPorRol, useAuth } from '../AuthContext';
import { erroresDeApi, limpiar, validarCorreo, validarObligatorio } from '../validation';
import type { Errores } from '../validation';

interface LocationState {
  from?: { pathname?: string; search?: string; hash?: string };
}

function destinoOrigen(state: unknown): string | null {
  const from = (state as LocationState | null)?.from;
  if (!from?.pathname || !from.pathname.startsWith('/')) return null;
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export function LoginPage() {
  const { usuario, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [general, setGeneral] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: () => iniciarSesion(correo.trim(), contrasena),
    onSuccess: (u) => void navigate(destinoOrigen(location.state) ?? rutaInicialPorRol(u), { replace: true }),
    onError: (e) => {
      const r = erroresDeApi(e);
      setErrores(r.campos);
      setGeneral(r.general);
    },
  });

  if (usuario && !mutacion.isPending) {
    return <Navigate to={destinoOrigen(location.state) ?? rutaInicialPorRol(usuario)} replace />;
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const nuevos = limpiar({
      correo: validarCorreo(correo.trim()),
      contrasena: validarObligatorio(contrasena, 'La contraseña'),
    });
    setErrores(nuevos);
    if (Object.keys(nuevos).length === 0) mutacion.mutate();
  }

  return (
    <div className="page page--narrow">
      <Card>
        <h1>Ingresar</h1>
        <form onSubmit={enviar} noValidate className="form">
          {general && <Alert tone="error">{general}</Alert>}
          <Input label="Correo electrónico" type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} error={errores.correo} />
          <Input label="Contraseña" type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} error={errores.contrasena} />
          <Button type="submit" block loading={mutacion.isPending}>
            Ingresar
          </Button>
        </form>
        <p className="form__links">
          <Link to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link>
          <span>
            ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
          </span>
        </p>
      </Card>
    </div>
  );
}
