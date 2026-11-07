import { Link, useRouteError } from 'react-router-dom';

/**
 * Error inesperado al mostrar una página (HT-14): el usuario ve un mensaje amigable en español,
 * nunca el detalle técnico. El detalle queda en la consola del navegador para depurar.
 */
export function ErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="page page--narrow" role="alert">
      <h1>Algo salió mal</h1>
      <p>Ocurrió un error inesperado al mostrar esta página. Intenta de nuevo; si el problema continúa, vuelve más tarde.</p>
      <div className="acciones">
        <button type="button" className="btn btn--secondary" onClick={() => window.location.reload()}>
          Reintentar
        </button>
        <Link className="btn btn--primary" to="/">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
