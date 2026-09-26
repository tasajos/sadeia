import { Router } from 'express';
import { q, one, pool, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { auditReq } from '../services/auditService.js';
import { detalleReporte } from '../services/citizenService.js';
import { uploadPhotos, folder, publicPath } from '../middleware/upload.js';
import { notFound, conflict, forbidden, badRequest } from '../utils/http.js';
import { emit } from '../socket.js';

const r = Router();

async function miEquipo(req) {
  if (!req.user.equipo_id) throw forbidden('Su usuario no está asociado a un equipo de rescate');
  return one('SELECT e.*, i.nombre AS institucion FROM equipo e JOIN institucion i ON i.id = e.institucion_id WHERE e.id = ?', [req.user.equipo_id]);
}

async function miDespacho(req) {
  const eq = await miEquipo(req);
  const d = await one('SELECT * FROM despacho WHERE id = ? AND equipo_id = ?', [req.params.id, eq.id]);
  if (!d) throw notFound('Misión no encontrada para su equipo');
  return { eq, d };
}

const notificar = (d, reporte, estado) => {
  emit('despacho:actualizado', { despacho_id: d.id, reporte, estado }, 'perm:ciudadanos.ver');
  emit('reporte:actualizado', { codigo: reporte, estado }, `reporte:${reporte}`);
};

/** Estado del equipo y misión activa (app de rescate). */
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
  if (d.estado !== 'Despachado') throw conflict('La misión ya fue respondida');
  await pool.query("UPDATE despacho SET estado = 'Aceptada', fecha_aceptacion = NOW() WHERE id = ?", [d.id]);
  const rep = await one('SELECT codigo FROM reporte_ciudadano WHERE id = ?', [d.reporte_id]);
  await auditReq(req, 'ACEPTAR_MISION', `${eq.codigo} · ${rep.codigo}`);
  notificar(d, rep.codigo, 'Aceptada');
  res.json({ ok: true });
});

r.post('/:id/rechazar', can('rescate.misiones'), async (req, res) => {
  const { eq, d } = await miDespacho(req);
  if (d.estado !== 'Despachado') throw conflict('La misión ya fue respondida');
  const rep = await one('SELECT * FROM reporte_ciudadano WHERE id = ?', [d.reporte_id]);
  await tx(async (c) => {
    await c.query("UPDATE despacho SET estado = 'Rechazada' WHERE id = ?", [d.id]);
    await c.query("UPDATE equipo SET estado = 'Disponible' WHERE id = ?", [eq.id]);
    const [[o]] = await c.query("SELECT COUNT(*) AS n FROM despacho WHERE reporte_id = ? AND estado <> 'Rechazada'", [rep.id]);
    if (!Number(o.n)) await c.query("UPDATE reporte_ciudadano SET estado = 'En revisión' WHERE id = ?", [rep.id]);
  });
  await auditReq(req, 'RECHAZAR_MISION', `${eq.codigo} · ${rep.codigo}`, { motivo: req.body.motivo || 'No disponible' });
  notificar(d, rep.codigo, 'Rechazada');
  res.json({ ok: true });
});

/** Avance de la misión: llegada al sitio → situación controlada. */
r.post('/:id/avanzar', can('rescate.misiones'), async (req, res) => {
  const { eq, d } = await miDespacho(req);
  const rep = await one('SELECT codigo FROM reporte_ciudadano WHERE id = ?', [d.reporte_id]);
  if (d.estado === 'Aceptada') {
    await pool.query("UPDATE despacho SET estado = 'En sitio', fecha_llegada = NOW() WHERE id = ?", [d.id]);
    await auditReq(req, 'LLEGADA_SITIO', `${eq.codigo} · ${rep.codigo}`);
    notificar(d, rep.codigo, 'En sitio');
    return res.json({ estado: 'En sitio' });
  }
  if (d.estado === 'En sitio') {
    await tx(async (c) => {
      await c.query("UPDATE despacho SET estado = 'Controlada', fecha_control = NOW() WHERE id = ?", [d.id]);
      await c.query("UPDATE equipo SET estado = 'Disponible' WHERE id = ?", [eq.id]);
      await c.query("UPDATE reporte_ciudadano SET estado = 'Atendido' WHERE id = ?", [d.reporte_id]);
    });
    await auditReq(req, 'SITUACION_CONTROLADA', `${eq.codigo} · ${rep.codigo}`);
    notificar(d, rep.codigo, 'Atendido');
    return res.json({ estado: 'Controlada' });
  }
  throw conflict(d.estado === 'Despachado' ? 'Acepte primero la misión' : 'La misión ya está cerrada');
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
  emit('informe:nuevo', { reporte: rep.codigo, equipo: eq.codigo, rescatados: n('rescatados'), apoyos }, 'perm:ciudadanos.ver');
  res.status(201).json({ id: informeId });
});

/** Posición GPS del equipo (seguimiento en el mapa del COEN). */
r.put('/ubicacion', can('rescate.misiones'), async (req, res) => {
  const eq = await miEquipo(req);
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badRequest('Coordenadas inválidas');
  await pool.query('UPDATE equipo SET lat = ?, lng = ?, ubicacion_at = NOW() WHERE id = ?', [lat, lng, eq.id]);
  emit('equipo:ubicacion', { id: eq.id, codigo: eq.codigo, lat, lng }, 'perm:ciudadanos.ver');
  res.json({ ok: true });
});

export default r;
