import { logger } from '../logger/logger';

/**
 * Bus de eventos en memoria: desacopla los módulos (docs/arquitectura.md).
 * Los módulos publican hechos ya confirmados (después del COMMIT) y otros reaccionan.
 * Un fallo en un suscriptor se registra y no afecta a quien publica ni a los demás suscriptores.
 *
 * Límite conocido: no sobrevive a un reinicio. Lo que no pueda perderse debe quedar como estado en la BD.
 *
 * Cada módulo declara sus eventos en `<modulo>.events.ts` ampliando esta interfaz:
 *   declare module '../../shared/events/eventBus' { interface EventosDelSistema { MiEvento: {...} } }
 * Así `shared/` no conoce a ningún módulo y los nombres y datos de los eventos siguen tipados.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EventosDelSistema {}

type Manejador<P> = (payload: P) => void | Promise<void>;

class EventBus {
  private readonly manejadores = new Map<string, Manejador<unknown>[]>();

  on<K extends keyof EventosDelSistema & string>(evento: K, manejador: Manejador<EventosDelSistema[K]>): () => void {
    const lista = this.manejadores.get(evento) ?? [];
    lista.push(manejador as Manejador<unknown>);
    this.manejadores.set(evento, lista);
    return () => {
      const actual = this.manejadores.get(evento) ?? [];
      this.manejadores.set(
        evento,
        actual.filter((m) => m !== manejador),
      );
    };
  }

  /** Publica y espera a que todos los suscriptores terminen (los errores se registran, no se propagan). */
  async emit<K extends keyof EventosDelSistema & string>(evento: K, payload: EventosDelSistema[K]): Promise<void> {
    const lista = this.manejadores.get(evento) ?? [];
    await Promise.all(
      lista.map(async (m) => {
        try {
          await m(payload);
        } catch (err) {
          logger.error('Error en un suscriptor de evento', { evento, error: (err as Error).message });
        }
      }),
    );
  }

  limpiar(): void {
    this.manejadores.clear();
  }
}

export const eventBus = new EventBus();
