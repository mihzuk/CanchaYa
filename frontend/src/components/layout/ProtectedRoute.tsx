import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import type { Rol } from '../../lib/types';
import { Spinner } from '../ui';

interface ProtectedRouteProps {
  roles?: Rol[];
  children: ReactNode;
}

export function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <Spinner label="Verificando tu sesión…" />;
  if (!usuario) return <Navigate to="/ingresar" replace state={{ from: location }} />;
  if (roles && !roles.includes(usuario.rol)) {
    return (
      <div className="page page--narrow">
        <h1>Acceso restringido (403)</h1>
        <p>No tienes permisos para ver esta página.</p>
        <Link className="btn btn--primary" to="/">
          Volver al inicio
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
