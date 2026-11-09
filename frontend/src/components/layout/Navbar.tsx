import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';

export function Navbar() {
  const { usuario, cerrarSesion } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setAbierto(false);
  }, [location.pathname]);

  async function salir() {
    await cerrarSesion();
    void navigate('/');
  }

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link to="/" className="navbar__logo">
          CanchaYa
        </Link>
        <button
          type="button"
          className="navbar__toggle"
          aria-expanded={abierto}
          aria-controls="menu-principal"
          onClick={() => setAbierto((v) => !v)}
        >
          <span className="sr-only">{abierto ? 'Cerrar menú' : 'Abrir menú'}</span>
          <span aria-hidden="true">{abierto ? '✕' : '☰'}</span>
        </button>
        <nav id="menu-principal" className={`navbar__menu${abierto ? ' is-open' : ''}`} aria-label="Principal">
          <NavLink to="/complejos">Complejos</NavLink>
          <NavLink to="/disponibilidad">Buscar cancha</NavLink>
          <NavLink to="/partidos">Busca Partido</NavLink>
          {usuario && <NavLink to="/mis-reservas">Mis reservas</NavLink>}
          {usuario && <NavLink to="/mis-equipos">Mis equipos</NavLink>}
          {usuario && <NavLink to="/mis-complejos">Mis complejos</NavLink>}
          {usuario?.rol === 'Superadmin' && <NavLink to="/admin/complejos">Aprobar complejos</NavLink>}
          {usuario ? (
            <>
              <NavLink to="/perfil">Mi perfil</NavLink>
              <button type="button" className="navbar__link-btn" onClick={() => void salir()}>
                Salir
              </button>
            </>
          ) : (
            <>
              <NavLink to="/ingresar">Ingresar</NavLink>
              <NavLink to="/registro" className="navbar__cta">
                Registrarse
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
