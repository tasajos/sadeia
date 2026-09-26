import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async (silent = false) => {
    if (!silent) await api.post('/auth/logout').catch(() => {});
    setToken(null);
    disconnectSocket();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout(true));
    if (!getToken()) { setReady(true); return; }
    api.get('/auth/me')
      .then((r) => { setUser(r.data); connectSocket(); })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const r = await api.post('/auth/login', { username, password });
    setToken(r.data.token);
    setUser(r.data.user);
    connectSocket();
    return r.data.user;
  }, []);

  const can = useCallback((...perms) => !!user && perms.some((p) => user.permisos.includes(p)), [user]);

  const value = useMemo(() => ({ user, ready, login, logout, can }), [user, ready, login, logout, can]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
