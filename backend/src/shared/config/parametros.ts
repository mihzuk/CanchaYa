import { query, type Queryable } from '../database/pool';

/**
 * Parámetros globales de las reglas de negocio (tabla parametro_sistema, HU-33.3).
 * Se leen con una caché corta: un cambio del superadministrador aplica a las nuevas reservas en segundos.
 */
export interface Parametros {
  /** RN-02: minutos que se retiene una reserva sin pago. */
  retencionReservaMin: number;
  /** RN-03: porcentaje de abono por defecto. */
  abonoPctDefecto: number;
  /** RN-05: reembolso al cancelar con más de 24 h. */
  reembolsoPct24h: number;
  /** RN-05: reembolso al cancelar entre 6 y 24 h. */
  reembolsoPct6h: number;
  /** RN-06: días máximos de anticipación para reservar. */
  diasAnticipacionMax: number;
  /** RN-09: horas mínimas antes del partido para publicar en Busca Partido. */
  horasMinPublicacion: number;
  /** HU-26: horas para que el rival pague su abono. */
  plazoPagoRivalHoras: number;
  /** RN-08 */
  inasistenciasSuspension: number;
  diasSuspension: number;
}

const CLAVES: Record<keyof Parametros, string> = {
  retencionReservaMin: 'retencion_reserva_min',
  abonoPctDefecto: 'abono_pct_defecto',
  reembolsoPct24h: 'reembolso_pct_24h',
  reembolsoPct6h: 'reembolso_pct_6h',
  diasAnticipacionMax: 'dias_anticipacion_max',
  horasMinPublicacion: 'horas_min_publicacion',
  plazoPagoRivalHoras: 'plazo_pago_rival_horas',
  inasistenciasSuspension: 'inasistencias_suspension',
  diasSuspension: 'dias_suspension',
};

/** Valores de las reglas de negocio si la tabla no tiene el parámetro. */
export const PARAMETROS_POR_DEFECTO: Parametros = {
  retencionReservaMin: 15,
  abonoPctDefecto: 50,
  reembolsoPct24h: 100,
  reembolsoPct6h: 50,
  diasAnticipacionMax: 30,
  horasMinPublicacion: 3,
  plazoPagoRivalHoras: 2,
  inasistenciasSuspension: 3,
  diasSuspension: 15,
};

const DURACION_CACHE_MS = 30_000;
let cache: { valor: Parametros; vence: number } | undefined;

/** `db`: dentro de una transacción, para no pedir una segunda conexión al pool. */
export async function obtenerParametros(db?: Queryable): Promise<Parametros> {
  if (cache && cache.vence > Date.now()) return cache.valor;
  const filas = await query<{ clave: string; valor: string }>('SELECT clave, valor FROM parametro_sistema', [], db);
  const porClave = new Map(filas.map((f) => [f.clave, Number(f.valor)]));
  const valor = { ...PARAMETROS_POR_DEFECTO };
  for (const [campo, clave] of Object.entries(CLAVES) as [keyof Parametros, string][]) {
    const v = porClave.get(clave);
    if (v !== undefined && Number.isFinite(v)) valor[campo] = v;
  }
  cache = { valor, vence: Date.now() + DURACION_CACHE_MS };
  return valor;
}

/** Tras cambiar un parámetro (o en pruebas) se descarta la caché. */
export function invalidarParametros(): void {
  cache = undefined;
}

export const CLAVES_PARAMETROS = CLAVES;
