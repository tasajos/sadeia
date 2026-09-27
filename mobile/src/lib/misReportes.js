import AsyncStorage from '@react-native-async-storage/async-storage';

/** Reportes enviados desde este teléfono (código + token de seguimiento). Sin cuenta de usuario. */
const KEY = 'sadeia_mis_reportes';

export async function misReportes() {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
}

export async function guardarMiReporte({ codigo, token, prioridad, titulo }) {
  if (!codigo || !token) return;
  const list = (await misReportes()).filter((r) => r.codigo !== codigo);
  list.unshift({ codigo, token, prioridad, titulo, fecha: new Date().toISOString() });
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
}
