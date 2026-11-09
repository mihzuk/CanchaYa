import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui';
import { clearSession, getToken, onSessionExpired, setToken } from '../../lib/session';
import * as authApi from './api';
import type { RegistroDatos, Usuario } from './types';

interface AuthContextValue {
  usuario: Usuario | null;
  cargando: boolean;
  iniciarSesion: (correo: string, contrasena: string) => Promise<Usuario>;
  registrarse: (datos: RegistroDatos) => Promise<Usuario>;
  cerrarSesion: () => Promise<void>;
  actualizarUsuario: (usuario: Usuario) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState<boolean>(() => getToken() !== null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { mostrar } = useToast();
  const locationRef = useRef(location);
  locationRef.current = location;

  // Hidrata la sesión si hay token guardado.
  useEffect(() => {
    if (getToken() === null) return;
    let activo = true;
    authApi
      .obtenerYo()
      .then((r) => {
        if (activo) setUsuario(r.usuario);
      })
      .catch(() => {
        // Un 401 ya limpió la sesión; ante otros errores se continúa como visitante.
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  // Sesión vencida (401 con token): volver a /ingresar.
  useEffect(
    () =>
      onSessionExpired(() => {
        setUsuario(null);
        queryClient.clear();
        mostrar('Tu sesión expiró. Ingresa de nuevo.', 'info');
        const actual = locationRef.current;
        void navigate('/ingresar', { state: { from: actual } });
      }),
    [navigate, queryClient, mostrar],
  );

  const iniciarSesion = useCallback(async (correo: string, contrasena: string) => {
    const r = await authApi.login(correo, contrasena);
    setToken(r.token);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const registrarse = useCallback(async (datos: RegistroDatos) => {
    const r = await authApi.registrar(datos);
    setToken(r.token);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* se limpia la sesión local de todos modos */
    }
    clearSession();
    setUsuario(null);
    queryClient.clear();
  }, [queryClient]);

  const actualizarUsuario = useCallback((u: Usuario) => setUsuario(u), []);

  const value = useMemo(
    () => ({ usuario, cargando, iniciarSesion, registrarse, cerrarSesion, actualizarUsuario }),
    [usuario, cargando, iniciarSesion, registrarse, cerrarSesion, actualizarUsuario],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

/** Destino tras iniciar sesión según el rol (HU-02.1). */
export function rutaInicialPorRol(usuario: Usuario): string {
  if (usuario.rol === 'Superadmin') return '/admin/complejos';
  return usuario.rol === 'Jugador' ? '/complejos' : '/mis-complejos';
}
