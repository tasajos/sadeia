import { Router } from 'express';
import { q, one } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { auditReq } from '../services/auditService.js';
import { reentrenar } from '../services/modelService.js';
import { notFound, conflict } from '../utils/http.js';
import { parseJson } from '../utils/format.js';

const r = Router();

r.get('/', can('modelos.ver'), async (_req, res) => {
  const rows = await q(
    `SELECT m.*, a.nombre AS amenaza,
            p.version, p.f1, p.auc, p.recall_m AS recall, p.fecha AS entrenado,
            (SELECT COUNT(*) FROM modelo_version x WHERE x.modelo_id = m.id AND x.estado = 'Entrenando') AS entrenando
       FROM modelo_ia m LEFT JOIN amenaza a ON a.id = m.amenaza_id
       LEFT JOIN modelo_version p ON p.modelo_id = m.id AND p.estado = 'En producción'
      ORDER BY m.id`
  );
  res.json(rows.map((m) => ({ ...m, entrenando: Number(m.entrenando) > 0, hazard: m.amenaza || m.nombre })));
});

r.get('/:id/versiones', can('modelos.ver'), async (req, res) => {
  const m = await one('SELECT * FROM modelo_ia WHERE id = ?', [req.params.id]);
  if (!m) throw notFound();
  res.json(await q('SELECT * FROM modelo_version WHERE modelo_id = ? ORDER BY fecha DESC, id DESC', [m.id]));
});

r.post('/:id/reentrenar', can('modelos.reentrenar'), async (req, res) => {
  try {
    const out = await reentrenar(req.params.id, req.user);
    await auditReq(req, 'REENTRENAR_MODELO', `${out.modelo} → ${out.version}`);
    res.json(out);
  } catch (e) {
    throw conflict(e.message);
  }
});

r.get('/predicciones/recientes', can('modelos.ver', 'alertas.ver'), async (req, res) => {
  const rows = await q(
    `SELECT p.*, a.nombre AS amenaza, CONCAT(m.codigo,' ',mv.version) AS modelo
       FROM prediccion p JOIN amenaza a ON a.id = p.amenaza_id JOIN modelo_version mv ON mv.id = p.modelo_version_id
       JOIN modelo_ia m ON m.id = mv.modelo_id ORDER BY p.id DESC LIMIT ?`,
    [Math.min(Number(req.query.limit) || 30, 200)]
  );
  res.json(rows.map((p) => ({ ...p, variables: parseJson(p.variables, []) })));
});

export default r;
