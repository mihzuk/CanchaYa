// Almacén del token de sesión. Usa localStorage; si no está disponible, memoria.
const CLAVE = 'canchaya.token';
let enMemoria: string | null = null;
const oyentes = new Set<() => void>();

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(CLAVE) ?? enMemoria;
  } catch {
    return enMemoria;
  }
}

export function setToken(token: string): void {
  enMemoria = token;
  try {
    window.localStorage.setItem(CLAVE, token);
  } catch {
    /* almacenamiento no disponible: queda en memoria */
  }
}

export function clearSession(): void {
  enMemoria = null;
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    /* nada que limpiar */
  }
}

/** Suscripción al evento "la sesión expiró (401)". Devuelve la función para cancelar. */
export function onSessionExpired(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function notifySessionExpired(): void {
  oyentes.forEach((fn) => fn());
}
