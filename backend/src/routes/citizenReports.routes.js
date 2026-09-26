import { Router } from 'express';
import { q, one, pool, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { SQL_REPORTE } from './serializers.js';
import { auditReq } from '../services/auditService.js';
import { detalleReporte } from '../services/citizenService.js';
import { distanceKm, etaMin } from '../utils/geo.js';
import { notFound, conflict, required, badRequest } from '../utils/http.js';
import { emit } from '../socket.js';

const r = Router();

/** Bandeja del COEN: reportes ciudadanos priorizados por el triaje IA. */
r.get('/', can('ciudadanos.ver'), async (req, res) => {
  const where = req.query.todos ? '1=1' : "(r.estado NOT IN ('Falso / descartado','Atendido') OR r.created_at >= NOW() - INTERVAL 12 HOUR)";
  const rows = await q(
    `${SQL_REPORTE} WHERE ${where}
      ORDER BY FIELD(r.estado,'Nuevo','En revisión','Equipo despachado','Vinculado a evento','Atendido','Falso / descartado'),
               FIELD(r.prioridad,'CRÍTICA','ALTA','MEDIA','BAJA'), r.created_at DESC LIMIT 100`
  );
  const fotos = await q('SELECT reporte_id, COUNT(*) AS n FROM reporte_foto GROUP BY reporte_id');
  res.json(rows.map((x) => ({
    id: x.id, codigo: x.codigo, icono: x.icono, titulo: x.titulo, lugar: x.lugar, prioridad: x.prioridad, estado: x.estado,
    created_at: x.created_at, fotos: Number(fotos.find((f) => f.reporte_id === x.id)?.n || 0), lat: x.lat, lng: x.lng
  })));
});

/** Abrir un reporte: pasa automáticamente de "Nuevo" a "En revisión". */
r.get('/:id', can('ciudadanos.ver'), async (req, res) => {
  const pre = await one('SELECT id, codigo, estado FROM reporte_ciudadano WHERE id = ? OR codigo = ?', [req.params.id, req.params.id]);
  if (!pre) throw notFound('Reporte no encontrado');
  if (pre.estado === 'Nuevo' && req.user.permisos.includes('ciudadanos.gestionar')) {
    await pool.query("UPDATE reporte_ciudadano SET estado = 'En revisión', revisado_por = ? WHERE id = ?", [req.user.id, pre.id]);
    await auditReq(req, 'REVISAR_REPORTE', pre.codigo);
    emit('reporte:actualizado', { codigo: pre.codigo, estado: 'En revisión' }, ['perm:ciudadanos.ver', `reporte:${pre.codigo}`]);
  }
  res.json(await detalleReporte(pre.id));
});

/** Despachar un equipo de primera respuesta (genera misión en la app de rescate). */
r.post('/:id/despachar', can('ciudadanos.gestionar'), async (req, res) => {
  required(req.body, ['equipo_id']);
  const rep = await one('SELECT * FROM reporte_ciudadano WHERE id = ?', [req.params.id]);
  if (!rep) throw notFound();
  if (['Falso / descartado', 'Atendido'].includes(rep.estado)) throw conflict('El reporte ya está cerrado');
  const eq = await one('SELECT * FROM equipo WHERE id = ?', [req.body.equipo_id]);
  if (!eq) throw badRequest('Equipo inexistente');
  if (eq.estado !== 'Disponible') throw conflict(`${eq.codigo} no está disponible (${eq.estado})`);
  const km = distanceKm(Number(rep.lat), Number(rep.lng), Number(eq.lat), Number(eq.lng));
  const eta = etaMin(km);
  const despachoId = await tx(async (c) => {
    const [ins] = await c.query('INSERT INTO despacho (reporte_id, equipo_id, distancia_km, eta_min, despachado_por) VALUES (?,?,?,?,?)', [rep.id, eq.id, km.toFixed(2), eta, req.user.id]);
    await c.query("UPDATE equipo SET estado = 'En misión' WHERE id = ?", [eq.id]);
    await c.query("UPDATE reporte_ciudadano SET estado = 'Equipo despachado' WHERE id = ?", [rep.id]);
    return ins.insertId;
  });
  await auditReq(req, 'DESPACHAR_EQUIPO', `${eq.codigo} → ${rep.codigo}`, { eta_min: eta, km: km.toFixed(1) });
  emit('mision:nueva', { despacho_id: despachoId, reporte: rep.codigo, prioridad: rep.prioridad, titulo: rep.titulo }, `equipo:${eq.id}`);
  emit('reporte:actualizado', { codigo: rep.codigo, estado: 'Equipo despachado' }, ['perm:ciudadanos.ver', `reporte:${rep.codigo}`]);
  res.json({ ok: true, despacho_id: despachoId, eta_min: eta, distancia_km: Math.round(km * 10) / 10 });
});

r.post('/:id/vincular', can('ciudadanos.gestionar'), async (req, res) => {
  const rep = await one('SELECT * FROM reporte_ciudadano WHERE id = ?', [req.params.id]);
  if (!rep) throw notFound();
  const eventoId = req.body.evento_id || rep.evento_id;
  if (!eventoId) throw badRequest('Indique el evento a vincular');
  const ev = await one('SELECT codigo FROM evento WHERE id = ?', [eventoId]);
  if (!ev) throw badRequest('Evento inexistente');
  await pool.query(
    "UPDATE reporte_ciudadano SET evento_id = ?, estado = IF(estado IN ('Nuevo','En revisión'), 'Vinculado a evento', estado) WHERE id = ?",
    [eventoId, rep.id]
  );
  await auditReq(req, 'VINCULAR_REPORTE', `${rep.codigo} → ${ev.codigo}`);
  emit('reporte:actualizado', { codigo: rep.codigo }, 'perm:ciudadanos.ver');
  res.json({ ok: true });
});

r.post('/:id/falso', can('ciudadanos.gestionar'), async (req, res) => {
  const rep = await one('SELECT * FROM reporte_ciudadano WHERE id = ?', [req.params.id]);
  if (!rep) throw notFound();
  const activos = await one("SELECT COUNT(*) AS n FROM despacho WHERE reporte_id = ? AND estado IN ('Despachado','Aceptada','En sitio')", [rep.id]);
  if (Number(activos.n)) throw conflict('Hay un equipo en misión para este reporte');
  await pool.query("UPDATE reporte_ciudadano SET estado = 'Falso / descartado' WHERE id = ?", [rep.id]);
  await auditReq(req, 'DESCARTAR_REPORTE', rep.codigo, { motivo: req.body.motivo || null });
  emit('reporte:actualizado', { codigo: rep.codigo, estado: 'Falso / descartado' }, ['perm:ciudadanos.ver', `reporte:${rep.codigo}`]);
  res.json({ ok: true });
});

/** Equipos y su posición (mapa del COEN). */
r.get('/equipos/todos', can('ciudadanos.ver'), async (_req, res) => {
  res.json(await q('SELECT e.*, i.sigla AS institucion FROM equipo e JOIN institucion i ON i.id = e.institucion_id ORDER BY e.codigo'));
});

export default r;
