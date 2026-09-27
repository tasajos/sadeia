import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { toMultipart } from './multipart';

/**
 * URL del backend:
 *  1. EXPO_PUBLIC_API_URL (definida en .env o en eas.json por perfil de build)
 *  2. expo.extra.apiUrl en app.json
 *  3. En desarrollo: la IP de la PC que ejecuta "expo start", puerto 4000
 */
function resolveBase() {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra?.apiUrl;
  if (extra) return extra.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const BASE_URL = resolveBase();
const TOKEN_KEY = 'sadeia_token';

let memToken = null;
export async function getToken() {
  if (memToken) return memToken;
  try { memToken = Platform.OS === 'web' ? null : await SecureStore.getItemAsync(TOKEN_KEY); } catch { memToken = null; }
  return memToken;
}
export async function setToken(t) {
  memToken = t;
  if (Platform.OS === 'web') return;
  try { t ? await SecureStore.setItemAsync(TOKEN_KEY, t) : await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* sin almacenamiento seguro */ }
}

export class ApiError extends Error {
  constructor(status, message, network = false) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/**
 * Llamada a la API REST.
 * @param {string} path  p. ej. '/coordinacion/tareas/mias'
 * @param {{method?:string, body?:object, multipart?:{fields:object, photos:object[]}, auth?:boolean, timeout?:number}} opts
 */
export async function api(path, { method = 'GET', body, multipart, auth = true, timeout = 20000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let payload;
  if (multipart) {
    // Se arma antes del fetch: si falla la lectura de una foto es un error real, no "sin señal".
    const m = await toMultipart(multipart.fields, multipart.photos);
    headers['Content-Type'] = m.contentType;
    payload = m.body;
  } else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, { method, headers, body: payload, signal: ctrl.signal });
  } catch (err) {
    if (__DEV__) console.warn('[api]', method, path, err?.message); // distingue fallas reales de red de errores del envío
    const e = new ApiError(0, ctrl.signal.aborted ? 'El servidor tardó demasiado en responder' : 'Sin conexión con el servidor', true);
    e.detalle = err?.message;
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    if (res.status === 401 && auth && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.error || `Error ${res.status}`);
  }
  return data;
}

/**
 * URL de una foto servida por el backend: las rutas relativas (/uploads/…) se completan con el servidor y,
 * si vienen con localhost (PUBLIC_URL de desarrollo), se usa la IP del servidor.
 */
export const mediaUrl = (u) => (!u ? u : u.startsWith('/') ? `${BASE_URL}${u}` : u.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, BASE_URL));
