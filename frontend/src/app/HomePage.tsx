import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function HomePage() {
  const { usuario } = useAuth();
  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <h1>Reserva tu cancha sintética en minutos</h1>
          <p>
            CanchaYa te muestra la disponibilidad real de los complejos deportivos, te deja reservar,
            pagar y armar tu partido con tu equipo, sin llamadas ni mensajes.
          </p>
          <div className="hero__actions">
            <Link to="/complejos" className="btn btn--light">
              Ver complejos
            </Link>
            {!usuario && (
              <Link to="/registro" className="btn btn--outline-light">
                Crear mi cuenta
              </Link>
            )}
          </div>
        </div>
      </section>
      <section className="page">
        <ul className="features">
          <li>
            <h2>Disponibilidad al instante</h2>
            <p>Consulta horarios libres por cancha y fecha, y reserva en pocos pasos.</p>
          </li>
          <li>
            <h2>Juega con tu equipo</h2>
            <p>Crea equipos, invita amigos y divide el pago entre todos.</p>
          </li>
          <li>
            <h2>Busca partido</h2>
            <p>¿Te falta gente? Encuentra jugadores de tu nivel cerca de ti.</p>
          </li>
        </ul>
      </section>
    </>
  );
}
