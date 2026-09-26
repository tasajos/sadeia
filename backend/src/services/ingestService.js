import { q, one, pool } from '../config/db.js';
import { audit } from './auditService.js';
import { evaluarLugar } from './alertEngine.js';
import { emit } from '../socket.js';

/**
 * Adaptadores de fuentes (RNF-09): para incorporar una nueva fuente basta con
 * registrar un adaptador aquí; el resto del pipeline no cambia.
 * Cada adaptador devuelve un arreglo de lecturas normalizadas:
 *   { estacion, departamento, municipio, lat, lng, variable, valor, fecha_hora }
 */
const parseCsv = (text) => {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(/[;,]/).map((c) => c.trim());
  return lines.filter(Boolean).map((l) => {
    const vals = l.split(/[;,]/);
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]?.trim()]));
  });
};

export const ADAPTADORES = {
  'API REST': async (fuente) => {
    const r = await fetch(fuente.url, { headers: fuente.api_key ? { 'x-api-key': fuente.api_key } : {} });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return Array.isArray(j) ? j : j.lecturas || j.data || [];
  },
  // Para SFTP real puede sustituirse por ssh2-sftp-client; aquí se admite CSV publicado por HTTP(S).
  'SFTP / CSV': async (fuente) => {
    const r = await fetch(fuente.url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parseCsv(await r.text());
  },
  Formulario: async () => [], // carga manual desde la interfaz o POST /api/ingesta
  MQTT: async () => [] // ingesta push
};

let variablesCache = null;
async function variables() {
  if (!variablesCache) {
    const rows = await q('SELECT * FROM variable');
    variablesCache = new Map(rows.map((v) => [v.codigo, v]));
  }
  return variablesCache;
}
export const invalidarCacheVariables = () => { variablesCache = null; };

/** Valida una lectura (RF-02). Devuelve null si es válida o el motivo del descarte. */
async function validar(l, v) {
  if (!v) return 'Variable desconocida';
  if (l.valor === null || l.valor === undefined || l.valor === '' || Number.isNaN(Number(l.valor))) return 'Lectura vacía';
  const val = Number(l.valor);
  if ((v.min_fisico !== null && val < Number(v.min_fisico)) || (v.max_fisico !== null && val > Number(v.max_fisico))) {
    return 'Fuera de rango físico';
  }
  if (v.max_salto !== null) {
    const prev = await one(
      `SELECT valor FROM lectura WHERE estacion = ? AND variable_id = ? AND fecha_hora >= NOW() - INTERVAL 6 HOUR
        ORDER BY fecha_hora DESC LIMIT 1`,
      [l.estacion, v.id]
    );
    if (prev && Math.abs(val - Number(prev.valor)) > Number(v.max_salto)) return 'Salto no plausible';
  }
  return null;
}

/**
 * Normaliza, valida y almacena un lote de lecturas; luego re-evalúa los lugares afectados.
 * @returns {{recibidas, aceptadas, descartadas, evaluaciones}}
 */
export async function ingerir(fuente, lecturas, { evaluar = true } = {}) {
  const vars = await variables();
  let aceptadas = 0;
  const descartadas = [];
  const lugares = new Map();

  for (const raw of lecturas) {
    const l = {
      estacion: String(raw.estacion || raw.station || 'Sin estación').slice(0, 120),
      departamento: raw.departamento || null,
      municipio: raw.municipio || null,
      lat: raw.lat != null ? Number(raw.lat) : null,
      lng: raw.lng != null ? Number(raw.lng) : null,
      variable: String(raw.variable || '').trim(),
      valor: raw.valor ?? raw.value,
      fecha_hora: raw.fecha_hora ? new Date(raw.fecha_hora) : new Date()
    };
    const v = vars.get(l.variable);
    const motivo = await validar(l, v);
    if (motivo) {
      await pool.query(
        'INSERT INTO lectura_descartada (fecha_hora, fuente_id, estacion, variable, valor_texto, motivo) VALUES (?,?,?,?,?,?)',
        [l.fecha_hora, fuente.id, l.estacion, l.variable || '?', l.valor === null || l.valor === undefined ? 'null' : String(l.valor).slice(0, 60), motivo]
      );
      await audit({ usuario: 'sistema', operacion: 'DESCARTAR_LECTURA', objeto: l.estacion, detalle: { variable: l.variable, valor: l.valor, motivo } });
      descartadas.push({ ...l, motivo });
      continue;
    }
    await pool.query(
      `INSERT INTO lectura (fecha_hora, fuente_id, estacion, departamento, municipio, lat, lng, variable_id, valor)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [l.fecha_hora, fuente.id, l.estacion, l.departamento, l.municipio, l.lat, l.lng, v.id, Number(l.valor)]
    );
    aceptadas++;
    if (l.municipio && l.departamento) {
      lugares.set(`${l.municipio}|${l.departamento}`, { municipio: l.municipio, departamento: l.departamento, lat: l.lat, lng: l.lng });
    }
  }

  // Calidad = % de lecturas válidas de las últimas 24 h
  const [cal] = await q(
    `SELECT (SELECT COUNT(*) FROM lectura WHERE fuente_id = ? AND fecha_hora >= NOW() - INTERVAL 24 HOUR) AS ok,
            (SELECT COUNT(*) FROM lectura_descartada WHERE fuente_id = ? AND fecha_hora >= NOW() - INTERVAL 24 HOUR) AS ko`,
    [fuente.id, fuente.id]
  );
  const total = Number(cal.ok) + Number(cal.ko);
  await pool.query(
    "UPDATE fuente_datos SET ultima_sinc = NOW(), estado = 'Operativa', ultimo_error = NULL, calidad = ? WHERE id = ?",
    [total ? Math.round((Number(cal.ok) / total) * 1000) / 10 : null, fuente.id]
  );

  const evaluaciones = [];
  if (evaluar) {
    for (const lugar of lugares.values()) evaluaciones.push(...(await evaluarLugar(lugar)));
  }
  emit('ingesta:lote', { fuente: fuente.nombre, aceptadas, descartadas: descartadas.length }, 'perm:fuentes.ver');
  return { recibidas: lecturas.length, aceptadas, descartadas: descartadas.length, detalleDescartes: descartadas, evaluaciones };
}

/** Sincroniza una fuente con su adaptador (pull). */
export async function sincronizar(fuente) {
  const adapter = ADAPTADORES[fuente.adaptador];
  if (!adapter || !fuente.url) return { omitida: true };
  try {
    const lecturas = await adapter(fuente);
    return await ingerir(fuente, lecturas);
  } catch (e) {
    await pool.query("UPDATE fuente_datos SET estado = 'Con errores', ultimo_error = ? WHERE id = ?", [e.message.slice(0, 250), fuente.id]);
    return { error: e.message };
  }
}
