import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api';
import { borrarFotosCola, fotosDisponibles, persistirFotos, prepararFoto } from './photos';

/**
 * Cola de envíos sin señal (RNF-07, operación en campo):
 * "Sin señal: el reporte se guarda y se envía al reconectar."
 * Cada elemento: { id, path, fields, photos, auth, label, createdAt }
 */
const KEY = 'sadeia_cola_envios';
// Un envío multipart con fotos por red móvil puede tardar bastante más que una llamada JSON.
const TIMEOUT_ENVIO = 120000;
const listeners = new Set();
const handlers = {};
/** Callback al enviar un elemento encolado de cierto tipo (p. ej. guardar el código de seguimiento). */
export const onSentKind = (kind, fn) => { handlers[kind] = fn; };

async function read() {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
}
async function write(items) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items.length));
}

export const pendingCount = async () => (await read()).length;
export const onQueueChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function enqueue(item) {
  const items = await read();
  const photos = await persistirFotos(item.photos);
  items.push({ ...item, photos, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() });
  await write(items);
}

/**
 * Comprime las fotos e intenta enviar; si no hay red, encola. Devuelve {sent:true,data} o {queued:true}.
 * Los errores de validación (4xx) no se encolan: se propagan.
 */
export async function sendOrQueue({ path, fields, photos: originales = [], auth = true, label, kind }) {
  const photos = await Promise.all(originales.map(prepararFoto));
  try {
    const data = await api(path, { method: 'POST', multipart: { fields: { ...fields, fecha: new Date().toISOString() }, photos }, auth, timeout: TIMEOUT_ENVIO });
    return { sent: true, data };
  } catch (e) {
    if (e.network) {
      await enqueue({ path, fields: { ...fields, fecha: new Date().toISOString() }, photos, auth, label, kind });
      return { queued: true, detalle: e.detalle || e.message };
    }
    throw e;
  }
}

let flushing = false;
export async function flush() {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    const items = await read();
    const rest = [];
    for (const it of items) {
      try {
        const data = await api(it.path, { method: 'POST', multipart: { fields: it.fields, photos: fotosDisponibles(it.photos) }, auth: it.auth, timeout: TIMEOUT_ENVIO });
        sent++;
        borrarFotosCola(it.photos);
        if (it.kind && handlers[it.kind]) await handlers[it.kind](data, it);
      } catch (e) {
        if (e.network) rest.push(it); // sigue sin red: se conserva
        else borrarFotosCola(it.photos);
        // errores 4xx se descartan para no bloquear la cola
      }
    }
    // Conserva lo que se haya encolado mientras se enviaba.
    const nuevos = (await read()).filter((i) => !items.some((x) => x.id === i.id));
    await write([...rest, ...nuevos]);
  } finally {
    flushing = false;
  }
  return sent;
}

/** Reintenta automáticamente al recuperar la conexión. */
export function startAutoFlush(onSent) {
  return NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) flush().then((n) => n && onSent?.(n));
  });
}
