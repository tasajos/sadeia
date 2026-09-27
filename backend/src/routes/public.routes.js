import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { q, one, pool, nextCode, tx } from '../config/db.js';
import { SQL_ALERTA, alertaDTO } from './serializers.js';
import { uploadPhotos, folder, publicPath } from '../middleware/upload.js';
import { triaje } from '../services/triageService.js';
import { detalleReporte } from '../services/citizenService.js';
import { TIPOS_REPORTE } from '../services/domain.js';
import { audit } from '../services/auditService.js';
import { badRequest, notFound, clientIp } from '../utils/http.js';
import { emit } from '../socket.js';

/**
 * API pública de la App ciudadana (sin inicio de sesión).
 * Protegida con límite de tasa; el seguimiento requiere el token entregado al enviar.
 */
const r = Router();

const envioLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados reportes desde este dispositivo. Intente en unos minutos o llame al 110 / 119.' } });

r.get('/tipos', (_req, res) => res.json(Object.entries(TIPOS_REPORTE).map(([k, v]) => ({ k, label: v.label, icon: v.icon }))));

/** Alertas vigentes y ya notificadas (no se exponen propuestas pendientes). */
r.get('/alertas', async (req, res) => {
  const rows = await q(`${SQL_ALERTA} WHERE a.estado IN ('Validada y notificada','Notificada') ORDER BY FIELD(a.nivel,'roja','naranja','amarilla','verde'), a.created_at DESC`);
  res.json(rows.map((a) => {
    const d = alertaDTO(a);
    return { id: d.id, codigo: d.codigo, amenaza: d.amenaza, icono: d.icono, lugar: d.lugar, departamento: d.departamento, lat: d.lat, lng: d.lng, nivel: d.nivel, horizonte: d.horizonte };
  }));
});

r.post('/reportes', envioLimiter, folder('reportes'), uploadPhotos, async (req, res) => {
  const b = req.body;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -23.5 || lat > -9.5 || lng < -69.8 || lng > -57.3) {
    throw badRequest('Ubicación GPS inválida o fuera de Bolivia');
  }
  const tipo = TIPOS_REPORTE[b.tipo] ? b.tipo : 'otro';
  const personas = b.personas_riesgo === true || b.personas_riesgo === 'true' || b.personas_riesgo === '1';
  const tri = await triaje({ tipo, descripcion: b.descripcion, lat, lng, personas_riesgo: personas });
  const token = crypto.randomBytes(16).toString('hex');
  const t = TIPOS_REPORTE[tipo];
  const manual = b.ubicacion_origen === 'Manual';

  const { id, codigo } = await tx(async (c) => {
    const codigo = await nextCode('REP', 4, c);
    const [ins] = await c.query(
      `INSERT INTO reporte_ciudadano (codigo, token_seguimiento, tipo, icono, titulo, descripcion, lugar, departamento, lat, lng, precision_m, ubicacion_origen,
         personas_riesgo, riesgo_detalle, prioridad, reportante, telefono, ia_tipo, ia_confianza, ia_nota, duplicados, alerta_id, evento_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [codigo, token, tipo, t.icon, String(b.titulo || `${t.label} · reporte ciudadano`).slice(0, 150), String(b.descripcion || '').slice(0, 2000),
        String(b.lugar || '').slice(0, 150) || null, tri.departamento, lat, lng, !manual && b.precision_m ? Math.round(Number(b.precision_m)) : null, manual ? 'Manual' : 'GPS',
        personas ? 1 : 0, personas ? String(b.riesgo_detalle || 'Sí · indicado por el ciudadano').slice(0, 150) : 'No',
        tri.prioridad, String(b.reportante || '').slice(0, 120) || null, String(b.telefono || '').slice(0, 30) || null,
        tri.ia_tipo, tri.ia_confianza, tri.ia_nota, tri.duplicados, tri.alerta_id, tri.evento_id]
    );
    for (const f of req.files || []) await c.query('INSERT INTO reporte_foto (reporte_id, ruta) VALUES (?,?)', [ins.insertId, publicPath(f)]);
    return { id: ins.insertId, codigo };
  });

  await audit({ usuario: 'app-ciudadana', operacion: 'RECIBIR_REPORTE', objeto: `${codigo} · app ciudadana`, ip: clientIp(req), detalle: { prioridad: tri.prioridad } });
  emit('reporte:nuevo', {
    id, codigo, prioridad: tri.prioridad, titulo: t.label, icono: t.icon, lugar: String(b.lugar || '').slice(0, 150) || null,
    departamento: tri.departamento, personas_riesgo: personas
  }, 'perm:ciudadanos.ver');
  res.status(201).json({ codigo, token, prioridad: tri.prioridad, mensaje: 'Reporte recibido por el COEN' });
});

r.get('/reportes/:codigo', async (req, res) => {
  const ok = await one('SELECT id FROM reporte_ciudadano WHERE codigo = ? AND token_seguimiento = ?', [req.params.codigo, String(req.query.token || '')]);
  if (!ok) throw notFound('Reporte no encontrado');
  res.json(await detalleReporte(ok.id, { publico: true }));
});

export default r;
