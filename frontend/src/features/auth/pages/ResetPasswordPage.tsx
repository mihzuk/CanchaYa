import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Input } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { restablecerContrasena } from '../api';
import { erroresDeApi, validarContrasena } from '../validation';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<{ contrasena?: string; confirmar?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: () => restablecerContrasena(token ?? '', contrasena),
    onError: (e) => {
      const r = erroresDeApi(e);
      if (r.campos.contrasena) setErrores({ contrasena: r.campos.contrasena });
      setGeneral(r.general);
    },
  });

  const expirado = mutacion.error instanceof ApiError && mutacion.error.codigo === 'TOKEN_EXPIRADO';
  const invalido = mutacion.error instanceof ApiError && mutacion.error.codigo === 'TOKEN_INVALIDO';

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const nuevos = {
      contrasena: validarContrasena(contrasena),
      confirmar: confirmar !== contrasena ? 'Las contraseñas no coinciden.' : undefined,
    };
    setErrores(nuevos);
    if (!nuevos.contrasena && !nuevos.confirmar) mutacion.mutate();
  }

  let contenido;
  if (!token || invalido) {
    contenido = (
      <div className="stack">
        <Alert tone="error">El enlace no es válido o ya fue usado.</Alert>
        <Link className="btn btn--primary" to="/recuperar-contrasena">
          Solicitar un nuevo enlace
        </Link>
      </div>
    );
  } else if (expirado) {
    contenido = (
      <div className="stack">
        <Alert tone="error">El enlace expiró. Solicita uno nuevo para restablecer tu contraseña.</Alert>
        <Link className="btn btn--primary" to="/recuperar-contrasena">
          Solicitar un nuevo enlace
        </Link>
      </div>
    );
  } else if (mutacion.isSuccess) {
    contenido = (
      <div className="stack">
        <Alert tone="success">Tu contraseña fue actualizada. Ya puedes ingresar.</Alert>
        <Link className="btn btn--primary" to="/ingresar">
          Ir a ingresar
        </Link>
      </div>
    );
  } else {
    contenido = (
      <form onSubmit={enviar} noValidate className="form">
        {general && <Alert tone="error">{general}</Alert>}
        <Input label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres, con al menos una letra y un número." value={contrasena} onChange={(e) => setContrasena(e.target.value)} error={errores.contrasena} />
        <Input label="Confirmar contraseña" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} error={errores.confirmar} />
        <Button type="submit" block loading={mutacion.isPending}>
          Restablecer contraseña
        </Button>
      </form>
    );
  }

  return (
    <div className="page page--narrow">
      <Card>
        <h1>Restablecer contraseña</h1>
        {contenido}
      </Card>
    </div>
  );
}
