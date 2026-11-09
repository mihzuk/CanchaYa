/** Una tarea programada (HT-06): idempotente, se ejecuta cada `intervaloMs`. */
export interface Tarea {
  nombre: string;
  intervaloMs: number;
  /** Devuelve un resumen para el log, o undefined si no hubo nada que hacer. */
  ejecutar: (ahora: Date) => Promise<string | undefined>;
}
