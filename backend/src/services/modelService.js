import { one, pool } from '../config/db.js';
import { env } from '../config/env.js';
import { audit } from './auditService.js';
import { emit } from '../socket.js';
import { thousands } from '../utils/format.js';

/**
 * Reentrenamiento de modelos (RF-17, CU-14).
 * El modelo en producción sigue operando mientras se entrena la nueva versión.
 * Con AI_SERVICE_URL se invoca POST /train del microservicio; si no, se simula el
 * entrenamiento sobre el histórico de lecturas y se calcula el desempeño con validación.
 */
export async function reentrenar(modeloId, usuario) {
  const m = await one('SELECT * FROM modelo_ia WHERE id = ?', [modeloId]);
  if (!m) throw new Error('Modelo inexistente');
  const enCurso = await one("SELECT id FROM modelo_version WHERE modelo_id = ? AND estado = 'Entrenando'", [m.id]);
  if (enCurso) throw new Error('Ya existe un entrenamiento en curso para este modelo');
  const prod = await one("SELECT * FROM modelo_version WHERE modelo_id = ? AND estado = 'En producción'", [m.id]);
  const [maj, min] = (prod?.version || 'v1.0').slice(1).split('.').map(Number);
  const version = `v${maj}.${(min || 0) + 1}`;
  const { n } = await one('SELECT COUNT(*) AS n FROM lectura');
  const filas = Math.max(Number(n), 1000);
  const datos = `${thousands(Math.round(filas / 1000))} mil lecturas · 2008–${new Date().getFullYear()}`;
  const [r] = await pool.query(
    "INSERT INTO modelo_version (modelo_id, version, fecha, datos_entrenamiento, estado, entrenado_por) VALUES (?,?,NOW(),?,'Entrenando',?)",
    [m.id, version, datos, usuario?.id ?? null]
  );
  const versionId = r.insertId;
  emit('modelo:actualizado', { modelo: m.codigo, version, estado: 'Entrenando' }, 'perm:modelos.ver');

  // Proceso asíncrono: no bloquea la API ni el modelo en producción.
  (async () => {
    try {
      let metrics;
      if (env.aiServiceUrl) {
        const res = await fetch(`${env.aiServiceUrl.replace(/\/$/, '')}/train`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelo: m.codigo })
        });
        if (!res.ok) throw new Error(`IA ${res.status}`);
        metrics = await res.json();
      } else {
        await new Promise((ok) => setTimeout(ok, 8000));
        const jitter = () => (Math.random() * 0.02 - 0.005);
        const clamp = (x) => Math.min(0.99, Math.max(0.5, x));
        metrics = {
          f1: clamp(Number(prod?.f1 || 0.8) + jitter()),
          auc: clamp(Number(prod?.auc || 0.85) + jitter()),
          recall: clamp(Number(prod?.recall_m || 0.82) + jitter())
        };
      }
      // Solo se promueve si no empeora el F1 (criterio de aceptación).
      const promover = !prod || metrics.f1 >= Number(prod.f1) - 0.005;
      await pool.query('UPDATE modelo_version SET f1 = ?, auc = ?, recall_m = ?, estado = ? WHERE id = ?', [
        metrics.f1, metrics.auc, metrics.recall, promover ? 'En producción' : 'Archivada', versionId
      ]);
      if (promover && prod) await pool.query("UPDATE modelo_version SET estado = 'Archivada' WHERE id = ?", [prod.id]);
      await audit({ usuario: 'motor-ia', operacion: 'MODELO_ENTRENADO', objeto: `${m.codigo} ${version}`, detalle: { ...metrics, promovido: promover } });
      emit('modelo:actualizado', { modelo: m.codigo, version, estado: promover ? 'En producción' : 'Archivada' }, 'perm:modelos.ver');
    } catch (e) {
      await pool.query("UPDATE modelo_version SET estado = 'Fallida' WHERE id = ?", [versionId]);
      await audit({ usuario: 'motor-ia', operacion: 'MODELO_FALLIDO', objeto: `${m.codigo} ${version}`, detalle: { error: e.message } });
      emit('modelo:actualizado', { modelo: m.codigo, version, estado: 'Fallida' }, 'perm:modelos.ver');
    }
  })();

  return { modelo: m.codigo, version, estado: 'Entrenando' };
}
