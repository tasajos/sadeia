import { q, one, pool, nextCode } from '../config/db.js';
import { predict } from './inferenceService.js';
import { ALERTA_ABIERTA, ALERTA_PENDIENTE, NIVELES } from './domain.js';
import { audit } from './auditService.js';
import { emit } from '../socket.js';

/** Umbrales de una amenaza, con prioridad para los regionales sobre el nacional. */
async function umbralesDe(amenazaId, departamento) {
  const rows = await q(
    `SELECT u.*, v.codigo, v.nombre, v.unidad, v.id AS variable_id
       FROM umbral u JOIN variable v ON v.id = u.variable_id
      WHERE u.amenaza_id = ? AND (u.region IS NULL OR u.region = ?)
      ORDER BY u.region IS NULL`,
    [amenazaId, departamento]
  );
  const byVar = new Map();
  rows.forEach((r) => { if (!byVar.has(r.variable_id)) byVar.set(r.variable_id, r); });
  return [...byVar.values()];
}

/** Última lectura válida de cada variable en un municipio (ventana 72 h). */
async function ultimasLecturas(municipio, departamento, variableIds) {
  if (!variableIds.length) return new Map();
  const rows = await q(
    `SELECT l.variable_id, l.valor, l.lat, l.lng, l.estacion
       FROM lectura l
       JOIN (SELECT variable_id, MAX(fecha_hora) AS fh FROM lectura
              WHERE municipio = ? AND departamento = ? AND variable_id IN (?)
                AND fecha_hora >= NOW() - INTERVAL 72 HOUR
              GROUP BY variable_id) m ON m.variable_id = l.variable_id AND m.fh = l.fecha_hora
      WHERE l.municipio = ? AND l.departamento = ?`,
    [municipio, departamento, variableIds, municipio, departamento]
  );
  return new Map(rows.map((r) => [r.variable_id, r]));
}

/**
 * Evalúa todas las amenazas de un lugar (CU-02 → CU-03).
 * Devuelve las predicciones y alertas generadas o actualizadas.
 */
export async function evaluarLugar({ municipio, departamento, lat, lng }) {
  const amenazas = await q('SELECT * FROM amenaza WHERE activa = 1');
  const out = [];
  for (const a of amenazas) {
    const ums = await umbralesDe(a.id, departamento);
    if (!ums.length) continue;
    const lects = await ultimasLecturas(municipio, departamento, ums.map((u) => u.variable_id));
    // Se requiere al menos la mitad de las variables del modelo para inferir.
    if (lects.size < Math.ceil(ums.length / 2)) continue;
    const features = ums
      .filter((u) => lects.has(u.variable_id))
      .map((u) => ({
        codigo: u.codigo, nombre: u.nombre, unidad: u.unidad, valor: Number(lects.get(u.variable_id).valor),
        umbral: Number(u.valor), operador: u.operador, base: Number(u.base), escala_max: Number(u.escala_max), peso: Number(u.peso)
      }));

    const mv = await one(
      `SELECT mv.id, CONCAT(m.codigo, ' ', mv.version) AS etiqueta FROM modelo_version mv
         JOIN modelo_ia m ON m.id = mv.modelo_id WHERE m.amenaza_id = ? AND mv.estado = 'En producción' LIMIT 1`,
      [a.id]
    );
    if (!mv) continue;
    const res = await predict(a.codigo, features);
    if (!res) continue;

    const lugar = `${municipio}, ${departamento}`;
    const [ins] = await pool.query(
      `INSERT INTO prediccion (modelo_version_id, amenaza_id, departamento, lugar, lat, lng, probabilidad, horizonte, nivel, variables)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [mv.id, a.id, departamento, lugar, lat, lng, res.probabilidad, a.horizonte, res.nivel, JSON.stringify(res.variables)]
    );
    const pred = { id: ins.insertId, amenaza: a.nombre, lugar, ...res };
    if (res.nivel === 'verde') { out.push({ prediccion: pred }); continue; }

    await audit({ usuario: 'motor-ia', operacion: 'PREDICCION', objeto: `${mv.etiqueta} · ${departamento}`, detalle: { p: res.probabilidad, nivel: res.nivel } });

    const abierta = await one(
      `SELECT * FROM alerta WHERE amenaza_id = ? AND lugar = ? AND estado IN (?) AND created_at >= NOW() - INTERVAL 7 DAY
        ORDER BY id DESC LIMIT 1`,
      [a.id, lugar, ALERTA_ABIERTA]
    );
    if (!abierta) {
      const codigo = await nextCode('ALT', 4);
      const [r] = await pool.query(
        `INSERT INTO alerta (codigo, prediccion_id, amenaza_id, departamento, lugar, lat, lng, nivel, nivel_propuesto, probabilidad, horizonte, modelo, sustento)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [codigo, pred.id, a.id, departamento, lugar, lat, lng, res.nivel, res.nivel, res.probabilidad, a.horizonte, mv.etiqueta, JSON.stringify(res.variables)]
      );
      await audit({ usuario: 'motor-ia', operacion: 'PROPONER_ALERTA', objeto: codigo, detalle: { nivel: res.nivel } });
      emit('alerta:nueva', { id: r.insertId, codigo, nivel: res.nivel, amenaza: a.nombre, lugar, probabilidad: res.probabilidad, horizonte: a.horizonte }, 'perm:alertas.ver');
      out.push({ prediccion: pred, alerta: codigo, nueva: true });
    } else if (ALERTA_PENDIENTE.includes(abierta.estado)) {
      // La propuesta pendiente se actualiza con la nueva evidencia; el nivel solo escala, nunca baja solo.
      const nivel = NIVELES.indexOf(res.nivel) > NIVELES.indexOf(abierta.nivel_propuesto) ? res.nivel : abierta.nivel_propuesto;
      await pool.query(
        'UPDATE alerta SET probabilidad = ?, sustento = ?, prediccion_id = ?, nivel_propuesto = ?, nivel = IF(estado = ?, ?, nivel) WHERE id = ?',
        [res.probabilidad, JSON.stringify(res.variables), pred.id, nivel, 'Pendiente de validación', nivel, abierta.id]
      );
      emit('alerta:actualizada', { id: abierta.id, codigo: abierta.codigo }, 'perm:alertas.ver');
      out.push({ prediccion: pred, alerta: abierta.codigo, nueva: false });
    } else {
      out.push({ prediccion: pred, alerta: abierta.codigo, nueva: false });
    }
  }
  return out;
}
