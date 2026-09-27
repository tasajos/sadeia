import { Router } from 'express';
import { q, one, pool, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { auditReq } from '../services/auditService.js';
import { detalleReporte } from '../services/citizenService.js';
import { aceptarMision, rechazarMision, avanzarMision } from '../services/missionService.js';
import { uploadPhotos, folder, publicPath } from '../middleware/upload.js';
import { notFound, conflict, forbidden, badRequest } from '../utils/http.js';
import { emit } from '../socket.js';

const r = Router();

async function miEquipo(req) {
  if (!req.user.equipo_id) throw forbidden('Su usuario no está asociado a un equipo de primera respuesta');
  return one('SELECT e.*, i.nombre AS institucion FROM equipo e JOIN institucion i ON i.id = e.institucion_id WHERE e.id = ?', [req.user.equipo_id]);
}

async function miDespacho(req) {
  const eq = await miEquipo(req);
  const d = await one('SELECT * FROM despacho WHERE id = ? AND equipo_id = ?', [req.params.id, eq.id]);
  if (!d) throw notFound('Misión no encontrada para su equipo');
  return { eq, d };
}

/** Estado del equipo y misión activa (app de primera respuesta). */
r.get('/actual', can('rescate.misiones'), async (req, res) => {
  const eq = await miEquipo(req);
  const d = await one(
    `SELECT * FROM despacho WHERE equipo_id = ? AND estado IN ('Despachado','Aceptada','En sitio')
      ORDER BY fecha_despacho DESC LIMIT 1`, [eq.id]
  );
  const ultimo = d ? null : await one("SELECT * FROM despacho WHERE equipo_id = ? AND estado = 'Controlada' ORDER BY fecha_control DESC LIMIT 1", [eq.id]);
  const informe = ultimo ? await one('SELECT id FROM informe_sitio WHERE despacho_id = ?', [ultimo.id]) : null;
  const mision = d || (ultimo && !informe ? ultimo : null);
  res.json({
    equipo: eq,
    mision: mision ? { ...mision, reporte: await detalleReporte(mision.reporte_id) } : null
  });
});

r.get('/historial', can('rescate.misiones'), async (req, res) => {
  const eq = await miEquipo(req);
  res.json(await q(
    `SELECT d.*, r.codigo AS reporte, r.titulo, r.lugar FROM despacho d JOIN reporte_ciudadano r ON r.id = d.reporte_id
      WHERE d.equipo_id = ? ORDER BY d.fecha_despacho DESC LIMIT 50`, [eq.id]
  ));
});

r.post('/:id/aceptar', can('rescate.misiones'), async (req, res) => {
  const { eq, d } = await miDespacho(req);
  res.json({ ok: true, ...(await aceptarMision(req, eq, d)) });
});

r.post('/:id/rechazar', can('rescate.misiones'), async (req, res) => {
  const { eq, d } = await miDespacho(req);
  res.json({ ok: true, ...(await rechazarMision(req, eq, d)) });
});

/** Avance de la misión: llegada al sitio → situación controlada. */
r.post('/:id/avanzar', can('rescate.misiones'), async (req, res) => {
  const { eq, d } = await miDespacho(req);
  res.json(await avanzarMision(req, eq, d));
});

/** Informe en sitio: personas rescatadas, heridos, viviendas, apoyo solicitado, fotos. */
r.post('/:id/informe', can('rescate.misiones'), folder('informes'), uploadPhotos, async (req, res) => {
  const { eq, d } = await miDespacho(req);
  if (d.estado === 'Despachado' || d.estado === 'Rechazada') throw conflict('La misión no está en curso');
  const n = (k) => Math.max(0, Number(req.body[k]) || 0);
  let apoyos = req.body.apoyos;
  if (typeof apoyos === 'string') { try { apoyos = JSON.parse(apoyos); } catch { apoyos = apoyos.split(',').filter(Boolean); } }
  if (apoyos && !Array.isArray(apoyos)) throw badRequest('apoyos debe ser una lista');
  const rep = await one('SELECT codigo FROM reporte_ciudadano WHERE id = ?', [d.reporte_id]);
  const informeId = await tx(async (c) => {
    const [ins] = await c.query(
      'INSERT INTO informe_sitio (despacho_id, rescatados, heridos, viviendas, apoyos, observacion, usuario_id) VALUES (?,?,?,?,?,?,?)',
      [d.id, n('rescatados'), n('heridos'), n('viviendas'), JSON.stringify(apoyos || []), req.body.observacion || null, req.user.id]
    );
    for (const f of req.files || []) await c.query('INSERT INTO informe_foto (informe_id, ruta) VALUES (?,?)', [ins.insertId, publicPath(f)]);
    return ins.insertId;
  });
  await auditReq(req, 'INFORME_EN_SITIO', `${eq.codigo} · ${n('rescatados')} rescatados`, { reporte: rep.codigo, apoyos });
  emit('informe:nuevo', { reporte: rep.codigo, equipo: eq.codigo, rescatados: n('rescatados'), apoyos }, ['perm:ciudadanos.ver', `inst:${eq.institucion_id}`]);
  res.status(201).json({ id: informeId });
});

/** Posición GPS del equipo (seguimiento en el mapa del COEN). */
r.put('/ubicacion', can('rescate.misiones'), async (req, res) => {
  const eq = await miEquipo(req);
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badRequest('Coordenadas inválidas');
  await pool.query('UPDATE equipo SET lat = ?, lng = ?, ubicacion_at = NOW() WHERE id = ?', [lat, lng, eq.id]);
  emit('equipo:ubicacion', { id: eq.id, codigo: eq.codigo, lat, lng }, ['perm:ciudadanos.ver', `inst:${eq.institucion_id}`]);
  res.json({ ok: true });
});

export default r;
