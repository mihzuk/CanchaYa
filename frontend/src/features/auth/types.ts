import type { Rol } from '../../lib/types';

export type Posicion = 'arquero' | 'defensa' | 'medio' | 'delantero';
export type Nivel = 'principiante' | 'intermedio' | 'avanzado';

export interface Usuario {
  id: number;
  username: string;
  correo: string;
  nombres: string;
  apellidos: string;
  celular: string;
  fechaNacimiento: string;
  fotoUrl: string | null;
  posicionPreferida: Posicion | null;
  nivel: Nivel | null;
  rol: Rol;
  correoVerificado: boolean;
  fechaRegistro: string;
}

export interface SesionRespuesta {
  token: string;
  expiraEn: number;
  usuario: Usuario;
}

export interface RegistroDatos {
  nombres: string;
  apellidos: string;
  username: string;
  correo: string;
  celular: string;
  fechaNacimiento: string;
  contrasena: string;
  aceptaTratamientoDatos: true;
}

export interface PerfilDatos {
  nombres: string;
  apellidos: string;
  celular: string;
  fotoUrl: string | null;
  posicionPreferida: Posicion | null;
  nivel: Nivel | null;
}

export interface EquipoResumen {
  id: number;
  nombre: string;
  escudoUrl: string | null;
}

export interface PerfilPublico {
  username: string;
  nombres: string;
  apellidos: string;
  fotoUrl: string | null;
  posicionPreferida: Posicion | null;
  nivel: Nivel | null;
  fechaRegistro: string;
  partidosJugados: number;
  fairPlay: number | null;
  equipos: EquipoResumen[];
}

export const POSICIONES: { valor: Posicion; etiqueta: string }[] = [
  { valor: 'arquero', etiqueta: 'Arquero' },
  { valor: 'defensa', etiqueta: 'Defensa' },
  { valor: 'medio', etiqueta: 'Mediocampista' },
  { valor: 'delantero', etiqueta: 'Delantero' },
];

export const NIVELES: { valor: Nivel; etiqueta: string }[] = [
  { valor: 'principiante', etiqueta: 'Principiante' },
  { valor: 'intermedio', etiqueta: 'Intermedio' },
  { valor: 'avanzado', etiqueta: 'Avanzado' },
];

export function etiquetaPosicion(p: Posicion | null): string {
  return POSICIONES.find((x) => x.valor === p)?.etiqueta ?? 'Sin definir';
}

export function etiquetaNivel(n: Nivel | null): string {
  return NIVELES.find((x) => x.valor === n)?.etiqueta ?? 'Sin definir';
}
