import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { connectSocket, disconnectSocket } from './socket';

const Ctx = createContext(null);

/** Ruta de inicio según el rol del usuario (antes, el cambio de una contraseña temporal si está pendiente). */
export const homeFor = (u) => (!u ? '/' : u.debe_cambiar_password ? '/cuenta/password' : u.permisos.includes('rescate.misiones') ? '/rescate' : '/enlace');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async (silent = false) => {
    if (!silent) await api('/auth/logout', { method: 'POST' }).catch(() => {});
    await setToken(null);
    disconnectSocket();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout(true));
    (async () => {
      if (await getToken()) {
        try {
          setUser(await api('/auth/me'));
          await connectSocket();
        } catch (e) {
          if (!e.network) await setToken(null);
        }
      }
      setReady(true);
    })();
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password }, auth: false });
    const puedeMovil = r.user.permisos.some((p) => ['rescate.misiones', 'tareas.reportar', 'alertas.confirmar'].includes(p));
    if (!puedeMovil) throw new Error('Su rol no tiene funciones en la app móvil. Use el sistema web.');
    await setToken(r.token);
    setUser(r.user);
    await connectSocket();
    return r.user;
  }, []);

  // Tras cambiar una contraseña temporal: se habilita la sesión y se reconecta el tiempo real (salas por permiso).
  const passwordCambiada = useCallback(async () => {
    const u = { ...user, debe_cambiar_password: false };
    setUser(u);
    await connectSocket();
    return u;
  }, [user]);

  const value = useMemo(() => ({ user, ready, login, logout, passwordCambiada }), [user, ready, login, logout, passwordCambiada]);
  return createElement(Ctx.Provider, { value }, children);
}

export const useAuth = () => useContext(Ctx);
