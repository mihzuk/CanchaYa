import { createApp } from './app';
import { iniciarTareas } from './jobs';
import { env } from './shared/config/env';
import { pool } from './shared/database/pool';
import { logger } from './shared/logger/logger';

/** Arranque del servidor, tareas programadas (HT-06) y cierre ordenado. */
const app = createApp();
const servidor = app.listen(env.PORT, () => {
  logger.info('API de CanchaYa escuchando', { puerto: env.PORT, entorno: env.NODE_ENV });
});

let detenerTareas: (() => void) | undefined;
if (env.JOBS_ENABLED) {
  void iniciarTareas().then((detener) => {
    detenerTareas = detener;
  });
}

let cerrando = false;
function cerrar(senal: string): void {
  if (cerrando) return;
  cerrando = true;
  logger.info('Cerrando el servidor', { senal });
  detenerTareas?.();
  servidor.close(() => {
    pool
      .end()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
  // Si algo queda colgado, salir de todas formas.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => cerrar('SIGINT'));
process.on('SIGTERM', () => cerrar('SIGTERM'));
process.on('unhandledRejection', (razon) => {
  logger.error('Promesa rechazada sin manejar', { error: String(razon) });
});
