/**
 * Canal de las alarmas de primera respuesta (modal + sirena). Las disparan el socket
 * (`mision:nueva`, `tarea:nueva`) y las consultas periódicas (por si el socket estuvo caído);
 * cada despacho o tarea suena una sola vez.
 */
const listeners = new Set();
const vistos = new Set();

export function onMision(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function avisar(clave, item) {
  if (vistos.has(clave)) return;
  vistos.add(clave);
  listeners.forEach((fn) => fn(item));
}

/** @param {{ despacho_id: number, reporte: string, prioridad: string, titulo: string, lugar?: string, eta_min?: number, distancia_km?: number, personas_riesgo?: boolean }} m */
export function alarmaMision(m) {
  if (m?.despacho_id) avisar(`m:${m.despacho_id}`, { ...m, tipo: 'mision' });
}

/** Tarea asignada a la institución por el COEN / VIDECI. @param {{ id: number, codigo: string, titulo: string, plazo?: string, evento?: string, evento_titulo?: string, nivel?: string, origen?: string }} t */
export function alarmaTarea(t) {
  if (t?.id) avisar(`t:${t.id}`, { ...t, tipo: 'tarea' });
}
