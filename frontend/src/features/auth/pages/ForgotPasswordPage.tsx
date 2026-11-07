import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Input } from '../../../components/ui';
import { recuperarContrasena } from '../api';
import { erroresDeApi, validarCorreo } from '../validation';

export function ForgotPasswordPage() {
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: () => recuperarContrasena(correo.trim()),
    onError: (e) => setGeneral(erroresDeApi(e).general),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setGeneral(null);
    const v = validarCorreo(correo.trim());
    setError(v);
    if (!v) mutacion.mutate();
  }

  return (
    <div className="page page--narrow">
      <Card>
        <h1>Recuperar contraseña</h1>
        {mutacion.isSuccess ? (
          <div className="stack">
            <Alert tone="success">{mutacion.data.mensaje}</Alert>
            <Link to="/ingresar">Volver a ingresar</Link>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate className="form">
            <p>Escribe tu correo y, si existe una cuenta, te enviaremos un enlace para crear una nueva contraseña.</p>
            {general && <Alert tone="error">{general}</Alert>}
            <Input label="Correo electrónico" type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} error={error} />
            <Button type="submit" block loading={mutacion.isPending}>
              Enviar enlace
            </Button>
            <p className="form__links">
              <Link to="/ingresar">Volver a ingresar</Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
