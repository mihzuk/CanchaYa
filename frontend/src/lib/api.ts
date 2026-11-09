import { clearSession, getToken, notifySessionExpired } from './session';
import type { DetalleError, ErrorBody } from './types';

const BASE_URL = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly mensaje: string;
  readonly detalles: DetalleError[];
  readonly datos?: unknown;

  constructor(status: number, codigo: string, mensaje: string, detalles: DetalleError[] = [], datos?: unknown) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.mensaje = mensaje;
    this.detalles = detalles;
    this.datos = datos;
  }
}

function esErrorBody(valor: unknown): valor is ErrorBody {
  if (typeof valor !== 'object' || valor === null || !('error' in valor)) return false;
  const e = (valor as { error: unknown }).error;
  return typeof e === 'object' && e !== null && 'mensaje' in e && 'codigo' in e;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'No pudimos conectar con el servidor. Revisa tu conexión.');
  }

  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      clearSession();
      notifySessionExpired();
    }
    if (esErrorBody(data)) {
      const { codigo, mensaje, detalles, datos } = data.error;
      throw new ApiError(res.status, codigo, mensaje, detalles ?? [], datos);
    }
    throw new ApiError(res.status, 'ERROR_DESCONOCIDO', 'Ocurrió un error inesperado. Intenta de nuevo.');
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
