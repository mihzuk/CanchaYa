import type { ReactNode } from 'react';
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
import { AvailabilityPage } from '../features/bookings/pages/AvailabilityPage';
import { BookingPage } from '../features/bookings/pages/BookingPage';
import { MyBookingsPage } from '../features/bookings/pages/MyBookingsPage';
import { VenueBookingsPage } from '../features/bookings/pages/VenueBookingsPage';
import { MatchDetailPage } from '../features/matchmaking/pages/MatchDetailPage';
import { OpenMatchesPage } from '../features/matchmaking/pages/OpenMatchesPage';
import { PublishMatchPage } from '../features/matchmaking/pages/PublishMatchPage';
import { CreateTeamPage } from '../features/teams/pages/CreateTeamPage';
import { JoinTeamPage } from '../features/teams/pages/JoinTeamPage';
import { MyTeamsPage } from '../features/teams/pages/MyTeamsPage';
import { TeamPage } from '../features/teams/pages/TeamPage';
import { PaymentPage } from '../features/payments/pages/PaymentPage';
import { RefundsPage } from '../features/payments/pages/RefundsPage';
import { VenuePaymentsPage } from '../features/payments/pages/VenuePaymentsPage';
import { ManageVenuePage } from '../features/venues/pages/ManageVenuePage';
import { MyVenuesPage } from '../features/venues/pages/MyVenuesPage';
import { VenueDetailPage } from '../features/venues/pages/VenueDetailPage';
import { VenueListPage } from '../features/venues/pages/VenueListPage';
import { AlertPreferencesPage } from '../features/notifications/pages/AlertPreferencesPage';
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage';
import { RateVenuePage } from '../features/ratings/pages/RateVenuePage';
import { VenueNoShowsPage } from '../features/ratings/pages/VenueNoShowsPage';
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

const privada = (elemento: ReactNode) => <ProtectedRoute>{elemento}</ProtectedRoute>;
const gestor = (elemento: ReactNode) => <ProtectedRoute roles={['AdminComplejo', 'Superadmin']}>{elemento}</ProtectedRoute>;

// EP-03 / EP-04 · Reservas y pagos
const rutasReservas: RouteObject[] = [
  { path: 'disponibilidad', element: <AvailabilityPage /> },
  { path: 'reservar', element: privada(<BookingPage />) },
  { path: 'reservas/:id/pagar', element: privada(<PaymentPage />) },
  { path: 'mis-reservas', element: privada(<MyBookingsPage />) },
  { path: 'reservas/:id', element: privada(<RateVenuePage />) },
  { path: 'mis-complejos/:id/reservas', element: gestor(<VenueBookingsPage />) },
  { path: 'mis-complejos/:id/pagos', element: gestor(<VenuePaymentsPage />) },
  { path: 'mis-complejos/:id/reembolsos', element: gestor(<RefundsPage />) },
];

// EP-05 · Equipos
const rutasEquipos: RouteObject[] = [
  { path: 'mis-equipos', element: privada(<MyTeamsPage />) },
  { path: 'equipos/crear', element: privada(<CreateTeamPage />) },
  { path: 'equipos/:id', element: <TeamPage /> },
  { path: 'unirse/:token', element: <JoinTeamPage /> },
];

// EP-06 · Busca Partido
const rutasPartidos: RouteObject[] = [
  { path: 'partidos', element: <OpenMatchesPage /> },
  { path: 'partidos/publicar', element: privada(<PublishMatchPage />) },
  { path: 'partidos/:id', element: <MatchDetailPage /> },
];

// EP-07 · Notificaciones, alertas y calificaciones
const rutasNotificaciones: RouteObject[] = [
  { path: 'notificaciones', element: privada(<NotificationsPage />) },
  { path: 'notificaciones/alertas', element: privada(<AlertPreferencesPage />) },
  { path: 'mis-complejos/:id/inasistencias', element: gestor(<VenueNoShowsPage />) },
];

const hijas: RouteObject[] = [
  ...rutasGenerales,
  ...rutasAuth,
  ...rutasVenues,
  ...rutasAdminComplejo,
  ...rutasReservas,
  ...rutasEquipos,
  ...rutasPartidos,
  ...rutasNotificaciones,
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
