import { diaSemanaIso, horaAMinutos } from '../../../shared/utils/time';

export interface PreferenciaAlerta {
  dias: number[]; // 1 = lunes ... 7 = domingo
  horaInicio: string;
  horaFin: string;
  zona: string | null;
  nivel: string | null;
  tipoFutbol: number | null;
}

export interface PartidoParaAlerta {
  fecha: string | null;
  horaInicio: string | null;
  ciudad: string | null;
  barrio: string | null;
  zona: string | null;
  nivel: string;
  tipoFutbol: number;
}

const normalizar = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Palabras completas: "cali" no coincide con "calima". */
const contienePalabras = (texto: string, buscado: string) => !!buscado && ` ${texto} `.includes(` ${buscado} `);

/** HU-29.1: el partido coincide con los días, el rango de horas, la zona, el nivel y la modalidad. */
export function coincideConPreferencia(p: PreferenciaAlerta, partido: PartidoParaAlerta): boolean {
  if (!partido.fecha || !partido.horaInicio) return false;
  if (!p.dias.includes(diaSemanaIso(partido.fecha))) return false;
  const hora = horaAMinutos(partido.horaInicio);
  if (hora < horaAMinutos(p.horaInicio) || hora >= horaAMinutos(p.horaFin)) return false;
  if (p.nivel && p.nivel !== partido.nivel) return false;
  if (p.tipoFutbol && p.tipoFutbol !== partido.tipoFutbol) return false;
  if (p.zona) {
    const buscada = normalizar(p.zona);
    const lugares = [partido.ciudad, partido.barrio, partido.zona].filter((x): x is string => !!x).map(normalizar);
    if (!lugares.some((l) => contienePalabras(l, buscada) || contienePalabras(buscada, l))) return false;
  }
  return true;
}
