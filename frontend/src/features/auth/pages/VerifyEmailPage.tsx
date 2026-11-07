import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { reenviarVerificacion, verificarCorreo } from '../api';
import { useAuth } from '../AuthContext';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { usuario, actualizarUsuario } = useAuth();
  const { mostrar } = useToast();
  const iniciado = useRef(false);

  const verificar = useMutation({
    mutationFn: (t: string) => verificarCorreo(t),
    onSuccess: () => {
      if (usuario) actualizarUsuario({ ...usuario, correoVerificado: true });
    },
  });
  const reenviar = useMutation({
    mutationFn: reenviarVerificacion,
    onSuccess: () => mostrar('Te enviamos un nuevo correo de verificación.', 'success'),
    onError: (e) => mostrar(e instanceof ApiError ? e.mensaje : 'No pudimos reenviar el correo.', 'error'),
  });

  const { mutate } = verificar;
  useEffect(() => {
    if (token && !iniciado.current) {
      iniciado.current = true; // el token es de un solo uso: evitar doble envío en StrictMode
      mutate(token);
    }
  }, [token, mutate]);

  let contenido;
  if (!token) {
    contenido = <Alert tone="error">El enlace de verificación no es válido. Revisa el correo que te enviamos.</Alert>;
  } else if (verificar.isSuccess) {
    contenido = (
      <>
        <Alert tone="success">¡Listo! Tu correo fue verificado.</Alert>
        <Link className="btn btn--primary" to={usuario ? '/perfil' : '/ingresar'}>
          Continuar
        </Link>
      </>
    );
  } else if (verificar.isError) {
    const expirado = verificar.error instanceof ApiError && verificar.error.codigo === 'TOKEN_EXPIRADO';
    contenido = (
      <>
        <Alert tone="error">
          {expirado
            ? 'El enlace de verificación expiró. Solicita uno nuevo.'
            : 'El enlace de verificación no es válido o ya fue usado.'}
        </Alert>
        {usuario ? (
          <Button loading={reenviar.isPending} onClick={() => reenviar.mutate()}>
            Reenviar correo de verificación
          </Button>
        ) : (
          <p>
            <Link to="/ingresar">Ingresa</Link> para pedir un nuevo correo de verificación.
          </p>
        )}
      </>
    );
  } else {
    contenido = <Spinner label="Verificando tu correo…" />;
  }

  return (
    <div className="page page--narrow">
      <Card>
        <h1>Verificar correo</h1>
        <div className="stack">{contenido}</div>
      </Card>
    </div>
  );
}
