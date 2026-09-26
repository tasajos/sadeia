import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { q, one } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { auditReq } from '../services/auditService.js';
import { indicadores, alertasPorMes, exportarConsolidado, EXPORT_DIR } from '../services/reportService.js';
import { badRequest, notFound } from '../utils/http.js';

const r = Router();

r.get('/indicadores', can('reportes.ver'), async (_req, res) => res.json(await indicadores()));
r.get('/alertas-mes', can('reportes.ver'), async (_req, res) => res.json(await alertasPorMes()));
r.get('/generados', can('reportes.ver'), async (_req, res) =>
  res.json(await q('SELECT * FROM reporte_generado ORDER BY created_at DESC LIMIT 30')));

/** Descarga autenticada de un reporte generado. */
r.get('/generados/:id/archivo', can('reportes.ver'), async (req, res) => {
  const g = await one('SELECT * FROM reporte_generado WHERE id = ?', [req.params.id]);
  const file = g?.archivo ? path.join(EXPORT_DIR, path.basename(g.archivo)) : null;
  if (!file || !fs.existsSync(file)) throw notFound('Archivo no disponible');
  res.download(file, g.archivo);
});

/** RF-13: exportación en formato estándar (PDF, XLSX, CSV). Devuelve el archivo. */
r.post('/exportar', can('reportes.exportar'), async (req, res) => {
  const formato = String(req.body.formato || req.query.formato || '').toUpperCase();
  if (!['PDF', 'XLSX', 'CSV'].includes(formato)) throw badRequest('Formato: PDF, XLSX o CSV');
  const out = await exportarConsolidado(formato, req.user.username);
  await auditReq(req, 'EXPORTAR_REPORTE', `Consolidado mensual · ${formato}`);
  res.setHeader('Content-Type', out.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${out.nombre}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.sendFile(out.archivo);
});

export default r;
