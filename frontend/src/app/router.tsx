import { createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { AuthProvider } from '../features/auth/AuthContext';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ProfilePage } from '../features/auth/pages/ProfilePage';
import { PublicProfilePage } from '../features/auth/pages/PublicProfilePage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage';
import { PlatformAdminPage } from '../features/admin/pages/PlatformAdminPage';
import { ManageVenuePage } from '../features/venues/pages/ManageVenuePage';
import { MyVenuesPage } from '../features/venues/pages/MyVenuesPage';
import { VenueDetailPage } from '../features/venues/pages/VenueDetailPage';
import { VenueListPage } from '../features/venues/pages/VenueListPage';
import { ErrorPage } from './ErrorPage';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

// Para agregar una funcionalidad: crear su arreglo de rutas y añadirlo a `hijas`.

const rutasGenerales: RouteObject[] = [{ index: true, element: <HomePage /> }];

// EP-01 · Usuarios
const rutasAuth: RouteObject[] = [
  { path: 'ingresar', element: <LoginPage /> },
  { path: 'registro', element: <RegisterPage /> },
  { path: 'verificar-correo', element: <VerifyEmailPage /> },
  { path: 'recuperar-contrasena', element: <ForgotPasswordPage /> },
  { path: 'restablecer-contrasena', element: <ResetPasswordPage /> },
  {
    path: 'perfil',
    element: (
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    ),
  },
  { path: 'jugadores/:username', element: <PublicProfilePage /> },
];

// EP-02 · Complejos (públicas: /complejos, /complejos/:id)
const rutasVenues: RouteObject[] = [
  { path: 'complejos', element: <VenueListPage /> },
  { path: 'complejos/:id', element: <VenueDetailPage /> },
];

// EP-02 · Administración de complejos (roles AdminComplejo y Superadmin)
const rutasAdminComplejo: RouteObject[] = [
  // Cualquier usuario registrado puede registrar un complejo (HU-05).
  {
    path: 'mis-complejos',
    element: (
      <ProtectedRoute>
        <MyVenuesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'mis-complejos/:id',
    element: (
      <ProtectedRoute roles={['AdminComplejo', 'Superadmin']}>
        <ManageVenuePage />
      </ProtectedRoute>
    ),
  },
  {
    path: 'admin/complejos',
    element: (
      <ProtectedRoute roles={['Superadmin']}>
        <PlatformAdminPage />
      </ProtectedRoute>
    ),
  },
];

const hijas: RouteObject[] = [
  ...rutasGenerales,
  ...rutasAuth,
  ...rutasVenues,
  ...rutasAdminComplejo,
  { path: '*', element: <NotFoundPage /> },
];

function Raiz() {
  return (
    <AuthProvider>
      <Layout />
    </AuthProvider>
  );
}

// La ruta sin path con errorElement muestra los errores dentro del Layout (se conserva la navegación).
export const router = createBrowserRouter([
  { element: <Raiz />, children: [{ errorElement: <ErrorPage />, children: hijas }] },
]);
