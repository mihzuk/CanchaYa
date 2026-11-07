/**
 * Fechas y horas en America/Bogota (RNF-09).
 * Colombia usa UTC-5 todo el año (sin horario de verano desde 1993), por eso el desfase es fijo.
 *
 * Convenciones:
 * - Fecha de calendario: texto 'YYYY-MM-DD'.
 * - Hora del día: texto 'HH:MM' (se acepta 'HH:MM:SS' como entrada). '24:00' representa medianoche al cierre.
 * - Instante: objeto Date (UTC internamente).
 */
export const ZONA_HORARIA = 'America/Bogota';
const DESFASE_MS = -5 * 60 * 60 * 1000;
const MS_DIA = 24 * 60 * 60 * 1000;

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-4]):([0-5]\d)(?::([0-5]\d))?$/;

export function esFechaValida(fecha: string): boolean {
  const m = RE_FECHA.exec(fecha);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === fecha;
}

export function esHoraValida(hora: string): boolean {
  const m = RE_HORA.exec(hora);
  if (!m) return false;
  return m[1] !== '24' || (m[2] === '00' && (m[3] === undefined || m[3] === '00'));
}

/** 'HH:MM' o 'HH:MM:SS' -> minutos desde la medianoche (0..1440). */
export function horaAMinutos(hora: string): number {
  const m = RE_HORA.exec(hora);
  if (!m) throw new Error(`Hora inválida: ${hora}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutos desde la medianoche -> 'HH:MM'. */
export function minutosAHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normaliza 'HH:MM:SS' (como lo devuelve PostgreSQL) a 'HH:MM'. */
export function normalizarHora(hora: string): string {
  return minutosAHora(horaAMinutos(hora));
}

function fechaAUtc(fecha: string): Date {
  const m = RE_FECHA.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function utcAFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
  return utcAFecha(new Date(fechaAUtc(fecha).getTime() + dias * MS_DIA));
}

/** Diferencia en días de calendario (b - a). */
export function diferenciaDias(a: string, b: string): number {
  return Math.round((fechaAUtc(b).getTime() - fechaAUtc(a).getTime()) / MS_DIA);
}

/** Día de la semana ISO: 1 = lunes ... 7 = domingo. */
export function diaSemanaIso(fecha: string): number {
  const d = fechaAUtc(fecha).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Fecha y hora local de Bogotá de un instante. */
export function partesBogota(instante: Date): { fecha: string; hora: string; minutos: number } {
  const local = new Date(instante.getTime() + DESFASE_MS);
  const fecha = local.toISOString().slice(0, 10);
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { fecha, hora: minutosAHora(minutos), minutos };
}

export function hoyBogota(ahora: Date = new Date()): string {
  return partesBogota(ahora).fecha;
}

/** Instante (Date) que corresponde a una fecha y hora local de Bogotá. Acepta '24:00'. */
export function instanteBogota(fecha: string, hora: string): Date {
  return new Date(fechaAUtc(fecha).getTime() + horaAMinutos(hora) * 60_000 - DESFASE_MS);
}

/** 'YYYY-MM-DD HH:MM:SS' (TIMESTAMP local, como en bloqueo_horario) -> partes. */
export function separarTimestampLocal(ts: string): { fecha: string; hora: string } {
  const [fecha = '', hora = '00:00'] = ts.trim().split(/[ T]/);
  return { fecha, hora: normalizarHora(hora) };
}

export function timestampLocal(fecha: string, hora: string): string {
  return `${fecha} ${normalizarHora(hora)}:00`;
}

// ---------------------------------------------------------------------------------------------
// Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani"), necesarios para la tarifa de fin de
// semana y festivo (HU-08). Se calculan; no hace falta mantener una tabla por año.
// ---------------------------------------------------------------------------------------------

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Traslada la fecha al lunes siguiente si no cae en lunes (Ley Emiliani). */
function alSiguienteLunes(fecha: string): string {
  const dia = diaSemanaIso(fecha);
  return dia === 1 ? fecha : sumarDias(fecha, 8 - dia);
}

const cacheFestivos = new Map<number, Set<string>>();

export function festivosColombia(anio: number): Set<string> {
  const enCache = cacheFestivos.get(anio);
  if (enCache) return enCache;
  const f = (mes: number, dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const pascua = domingoDePascua(anio);
  const festivos = new Set<string>([
    // Fijos
    f(1, 1), f(5, 1), f(7, 20), f(8, 7), f(12, 8), f(12, 25),
    // Trasladables al lunes
    alSiguienteLunes(f(1, 6)), alSiguienteLunes(f(3, 19)), alSiguienteLunes(f(6, 29)),
    alSiguienteLunes(f(8, 15)), alSiguienteLunes(f(10, 12)), alSiguienteLunes(f(11, 1)),
    alSiguienteLunes(f(11, 11)),
    // Según la Pascua
    sumarDias(pascua, -3), // Jueves Santo
    sumarDias(pascua, -2), // Viernes Santo
    sumarDias(pascua, 43), // Ascensión del Señor (lunes)
    sumarDias(pascua, 64), // Corpus Christi (lunes)
    sumarDias(pascua, 71), // Sagrado Corazón (lunes)
  ]);
  cacheFestivos.set(anio, festivos);
  return festivos;
}

export function esFestivoColombia(fecha: string): boolean {
  return festivosColombia(Number(fecha.slice(0, 4))).has(fecha);
}

/** Sábado, domingo o festivo (HU-08 criterio 2). */
export function esFinDeSemanaOFestivo(fecha: string): boolean {
  return diaSemanaIso(fecha) >= 6 || esFestivoColombia(fecha);
}
