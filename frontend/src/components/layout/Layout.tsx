import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { reenviarVerificacion } from '../../features/auth/api';
import { useAuth } from '../../features/auth/AuthContext';
import { ApiError } from '../../lib/api';
import { Alert, Button, useToast } from '../ui';
import { Navbar } from './Navbar';

function BannerVerificacion() {
  const { usuario } = useAuth();
  const { mostrar } = useToast();
  const [oculto, setOculto] = useState(false);
  const reenviar = useMutation({
    mutationFn: reenviarVerificacion,
    onSuccess: () => mostrar('Te enviamos un nuevo correo de verificación.', 'success'),
    onError: (e) => mostrar(e instanceof ApiError ? e.mensaje : 'No pudimos reenviar el correo.', 'error'),
  });

  if (!usuario || usuario.correoVerificado || oculto) return null;
  return (
    <div className="banner">
      <Alert tone="warning" onClose={() => setOculto(true)}>
        <span>Verifica tu correo para completar tu cuenta. </span>
        <Button variant="secondary" loading={reenviar.isPending} onClick={() => reenviar.mutate()}>
          Reenviar correo de verificación
        </Button>
      </Alert>
    </div>
  );
}

export function Layout() {
  return (
    <div className="layout">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <Navbar />
      <BannerVerificacion />
      <main id="contenido" className="layout__main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer">
        <p>CanchaYa · Reserva tu cancha sintética. Código abierto.</p>
      </footer>
    </div>
  );
}
