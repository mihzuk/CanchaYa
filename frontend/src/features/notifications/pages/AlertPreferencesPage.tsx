import { Link } from 'react-router-dom';
import { AlertPreferencesForm } from '../components/AlertPreferencesForm';

export function AlertPreferencesPage() {
  return (
    <div className="page page--narrow stack stack--wide">
      <p>
        <Link to="/notificaciones">← Notificaciones</Link>
      </p>
      <h1>Alertas de partidos</h1>
      <AlertPreferencesForm />
    </div>
  );
}
