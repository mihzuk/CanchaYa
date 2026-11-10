import { createHash } from 'node:crypto';
import { pool } from '../shared/database/pool';
import { logger } from '../shared/logger/logger';
import { expirarReservasJob } from './expirar-reservas.job';
import { anularConfirmacionRivalJob } from './anular-confirmacion-rival.job';
import { levantarSuspensionesJob } from './levantar-suspensiones.job';
import { recordatoriosJob } from './recordatorios.job';
import { sincronizarPartidosJob } from './sincronizar-partidos.job';
import type { Tarea } from './tarea';

export type { Tarea } from './tarea';

/**
 * Tareas programadas (HT-06). Cada tarea corre en su intervalo dentro de un bloqueo consultivo de
 * PostgreSQL (pg_try_advisory_lock): con varias instancias del backend, solo una la ejecuta a la vez.
 * Las tareas son idempotentes, así que un reintento no duplica efectos.
 */
function claveDeBloqueo(nombre: string): number {
  // Entero de 32 bits estable a partir del nombre de la tarea.
  return createHash('sha256').update(`canchaya-tarea:${nombre}`).digest().readInt32BE(0);
}

/** Ejecuta una tarea una vez con el bloqueo de instancia. Devuelve false si otra instancia la tenía. */
export async function ejecutarTarea(tarea: Tarea, ahora = new Date()): Promise<boolean> {
  const cliente = await pool.connect();
  const clave = claveDeBloqueo(tarea.nombre);
  try {
    const { rows } = await cliente.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [clave]);
    if (!rows[0]?.ok) return false;
    try {
      const resumen = await tarea.ejecutar(ahora);
      if (resumen) logger.info('Tarea programada', { tarea: tarea.nombre, resumen });
    } finally {
      await cliente.query('SELECT pg_advisory_unlock($1)', [clave]);
    }
    return true;
  } catch (err) {
    logger.error('Falló una tarea programada', { tarea: tarea.nombre, error: (err as Error).message });
    return false;
  } finally {
    cliente.release();
  }
}

/** Registra y arranca las tareas. Devuelve una función para detenerlas (cierre ordenado). */
export async function iniciarTareas(): Promise<() => void> {
  const tareas: Tarea[] = [expirarReservasJob, sincronizarPartidosJob, recordatoriosJob, anularConfirmacionRivalJob, levantarSuspensionesJob];
  const enCurso = new Set<string>();
  const temporizadores = tareas.map((t) =>
    setInterval(() => {
      if (enCurso.has(t.nombre)) return; // no se solapa consigo misma
      enCurso.add(t.nombre);
      void ejecutarTarea(t).finally(() => enCurso.delete(t.nombre));
    }, t.intervaloMs),
  );
  logger.info('Tareas programadas iniciadas', { tareas: tareas.map((t) => t.nombre) });
  return () => temporizadores.forEach(clearInterval);
}
