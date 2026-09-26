import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from '../api/client';
import { getSocket } from '../api/socket';

/**
 * Carga datos de la API y los recarga automáticamente cuando llegan eventos
 * en tiempo real (tablero sin recarga manual — RF-12).
 * @param {string|null} url
 * @param {string[]} events eventos de socket que disparan recarga
 */
export function useApi(url, events = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!!url);
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);
  const evKey = events.join('|');

  const reload = useCallback(async () => {
    if (!url) return null;
    try {
      const r = await api.get(url);
      setData(r.data);
      setError(null);
      setUpdatedAt(new Date());
      return r.data;
    } catch (e) {
      setError(errMsg(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setLoading(!!url);
    reload();
  }, [reload, url]);

  useEffect(() => {
    const s = getSocket();
    if (!s || !evKey) return undefined;
    const handler = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(reload, 400); // agrupa ráfagas de eventos
    };
    const evs = evKey.split('|');
    evs.forEach((e) => s.on(e, handler));
    return () => { evs.forEach((e) => s.off(e, handler)); clearTimeout(timer.current); };
  }, [evKey, reload]);

  return { data, error, loading, reload, setData, updatedAt };
}

/** Ejecuta una acción (POST/PUT/...) con manejo de estado y toast. */
export function useAction(toast) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      return r ?? true;
    } catch (e) {
      toast(errMsg(e), 'err');
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}
