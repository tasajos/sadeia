import { Router } from 'express';
import { q, one, pool, nextCode, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { SQL_EVENTO } from './serializers.js';
import { auditReq } from '../services/auditService.js';
import { generarRecomendaciones } from '../services/recommendationService.js';
import { NIVELES } from '../services/domain.js';
import { badRequest, notFound, conflict, required } from '../utils/http.js';
import { emit } from '../socket.js';
import { DEPARTAMENTOS } from '../utils/geo.js';

const r = Router();

const eventoDTO = (e) => ({
  id: e.id, codigo: e.codigo, titulo: e.titulo, amenaza: e.amenaza, amenaza_id: e.amenaza_id, icono: e.icono,
  alerta_id: e.alerta_id, alerta_codigo: e.alerta_codigo, departamento: e.departamento, lugar: e.lugar, lat: e.lat, lng: e.lng,
  radio_km: e.radio_km != null ? Number(e.radio_km) : null, ubicacion_aprox: !!e.ubicacion_aprox,
  nivel: e.nivel, fecha_inicio: e.fecha_inicio, fecha_cierre: e.fecha_cierre, impacto: e.impacto,
  usa_protocolo: !!e.usa_protocolo, estado: e.estado, registrado_por: e.registrado_por_nombre
});

/**
 * Coordenadas del evento: las marcadas en el mapa, las de la alerta de origen o, en último caso,
 * el centro del departamento (marcado como aproximado para que el COEN lo corrija).
 */
function ubicacion(body, alerta, departamento) {
  const lat = body.lat !== undefined && body.lat !== '' && body.lat !== null ? Number(body.lat) : alerta?.lat != null ? Number(alerta.lat) : null;
  const lng = body.lng !== undefined && body.lng !== '' && body.lng !== null ? Number(body.lng) : alerta?.lng != null ? Number(alerta.lng) : null;
  if (lat != null && lng != null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -23.5 || lat > -9.5 || lng < -69.8 || lng > -57.3) throw badRequest('Ubicación fuera de Bolivia');
    return { lat, lng, aprox: 0 };
  }
  const c = DEPARTAMENTOS[departamento];
  return c ? { lat: c[0], lng: c[1], aprox: 1 } : { lat: null, lng: null, aprox: 1 };
}

const radio = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 500) throw badRequest('El radio de afectación debe estar entre 0,1 y 500 km');
  return Math.round(n * 10) / 10;
};

r.get('/', can('eventos.ver', 'tablero.ver'), async (req, res) => {
  const where = req.query.estado === 'todos' ? '1=1' : "e.estado = 'En curso'";
  const rows = await q(`${SQL_EVENTO} WHERE ${where} ORDER BY FIELD(e.nivel,'roja','naranja','amarilla','verde'), e.fecha_inicio DESC`);
  res.json(rows.map(eventoDTO));
});

r.get('/:id', can('eventos.ver'), async (req, res) => {
  const e = await one(`${SQL_EVENTO} WHERE e.id = ? OR e.codigo = ?`, [req.params.id, req.params.id]);
  if (!e) throw notFound('Evento no encontrado');
  const recs = await q(
    `SELECT rc.*, u.nombre AS decidido_por_nombre, t.codigo AS tarea_codigo
       FROM recomendacion rc LEFT JOIN usuario u ON u.id = rc.decidido_por
       LEFT JOIN tarea t ON t.recomendacion_id = rc.id
      WHERE rc.evento_id = ? ORDER BY rc.orden`,
    [e.id]
  );
  const recursos = await q(
    `SELECT ar.id, ar.cantidad, ar.estado, ar.fecha, rc.nombre, rc.unidad, i.sigla
       FROM asignacion_recurso ar JOIN recurso rc ON rc.id = ar.recurso_id JOIN institucion i ON i.id = rc.institucion_id
      WHERE ar.evento_id = ? ORDER BY ar.fecha DESC`,
    [e.id]
  );
  // Tareas del evento con la ubicación de la institución responsable (para el mapa del evento)
  const tareas = await q(
    `SELECT t.id, t.codigo, t.titulo, t.estado, t.avance, t.plazo, t.responsable, i.id AS institucion_id, i.sigla, i.nombre AS institucion,
            i.icono, i.tipo, i.lat, i.lng
       FROM tarea t JOIN institucion i ON i.id = t.institucion_id
      WHERE t.evento_id = ? ORDER BY FIELD(t.estado,'Vencida','En curso','Pendiente','Completada'), t.plazo`,
    [e.id]
  );
  // Reportes ciudadanos vinculados al evento por el triaje (o dentro del radio de afectación)
  const reportes = await q(
    `SELECT id, codigo, titulo, icono, lugar, lat, lng, prioridad, estado, created_at FROM reporte_ciudadano
      WHERE evento_id = ? AND estado <> 'Falso / descartado' ORDER BY created_at DESC LIMIT 100`,
    [e.id]
  );
  res.json({ ...eventoDTO(e), recomendaciones: recs, recursos, tareas: tareas.map((t) => ({ ...t, avance: Number(t.avance) })), reportes });
});

/** CU-05 · RF-08: registrar evento (tipología, ubicación, severidad, inicio). */
r.post('/', can('eventos.gestionar'), async (req, res) => {
  required(req.body, ['amenaza_id', 'lugar', 'departamento', 'nivel']);
  if (!NIVELES.includes(req.body.nivel)) throw badRequest('Nivel inválido');
  const am = await one('SELECT * FROM amenaza WHERE id = ?', [req.body.amenaza_id]);
  if (!am) throw badRequest('Amenaza inválida');
  let alerta = null;
  if (req.body.alerta_id) alerta = await one('SELECT * FROM alerta WHERE id = ?', [req.body.alerta_id]);
  const codigo = await nextCode('EVT', 3);
  const titulo = req.body.titulo || `${am.nombre} · ${req.body.lugar}`;
  const pos = ubicacion(req.body, alerta, req.body.departamento);
  const [ins] = await pool.query(
    `INSERT INTO evento (codigo, titulo, amenaza_id, alerta_id, departamento, lugar, lat, lng, radio_km, ubicacion_aprox, nivel, fecha_inicio, impacto, registrado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [codigo, titulo, am.id, alerta?.id ?? null, req.body.departamento, req.body.lugar, pos.lat, pos.lng, radio(req.body.radio_km), pos.aprox,
      req.body.nivel, req.body.fecha_inicio ? new Date(req.body.fecha_inicio) : new Date(), req.body.impacto || null, req.user.id]
  );
  await auditReq(req, 'REGISTRAR_EVENTO', codigo, { alerta: alerta?.codigo });
  const recs = await generarRecomendaciones(ins.insertId);
  emit('evento:nuevo', { id: ins.insertId, codigo, titulo });
  res.status(201).json({ id: ins.insertId, codigo, recomendaciones: recs.length });
});

/** Actualizar la situación del evento: severidad, impacto, ubicación y radio de afectación. */
r.patch('/:id', can('eventos.gestionar'), async (req, res) => {
  const e = await one('SELECT * FROM evento WHERE id = ?', [req.params.id]);
  if (!e) throw notFound();
  if (e.estado === 'Cerrado') throw conflict('El evento está cerrado');
  const b = req.body;
  const cambios = {};
  if (b.nivel !== undefined) {
    if (!NIVELES.includes(b.nivel)) throw badRequest('Nivel inválido');
    if (b.nivel !== e.nivel) cambios.nivel = b.nivel;
  }
  if (b.impacto !== undefined && (b.impacto || null) !== e.impacto) cambios.impacto = String(b.impacto || '').slice(0, 150) || null;
  if (b.lugar !== undefined && String(b.lugar).trim() && b.lugar !== e.lugar) cambios.lugar = String(b.lugar).trim().slice(0, 120);
  if (b.lat !== undefined && b.lng !== undefined && b.lat !== '' && b.lng !== '') {
    const pos = ubicacion(b, null, e.departamento);
    if (Number(e.lat) !== pos.lat || Number(e.lng) !== pos.lng || e.ubicacion_aprox) Object.assign(cambios, { lat: pos.lat, lng: pos.lng, ubicacion_aprox: 0 });
  }
  if (b.radio_km !== undefined) {
    const rk = radio(b.radio_km);
    if (rk !== (e.radio_km != null ? Number(e.radio_km) : null)) cambios.radio_km = rk;
  }
  if (!Object.keys(cambios).length) return res.json({ ok: true, cambios: 0 });
  await pool.query('UPDATE evento SET ? WHERE id = ?', [cambios, e.id]);
  await auditReq(req, 'ACTUALIZAR_EVENTO', e.codigo, cambios.nivel ? { ...cambios, nivel_anterior: e.nivel } : cambios);
  emit('evento:actualizado', { id: e.id });
  res.json({ ok: true, cambios: Object.keys(cambios).length });
});

/** Curso de acción propuesto por el COEN: entra como pendiente y lo decide el Decisor, igual que los del motor. */
r.post('/:id/recomendaciones', can('eventos.gestionar'), async (req, res) => {
  required(req.body, ['titulo', 'institucion_id']);
  const e = await one('SELECT id, codigo, estado FROM evento WHERE id = ?', [req.params.id]);
  if (!e) throw notFound();
  if (e.estado === 'Cerrado') throw conflict('El evento está cerrado');
  const inst = await one('SELECT id, sigla, nombre FROM institucion WHERE id = ? AND activa = 1', [req.body.institucion_id]);
  if (!inst) throw badRequest('Institución inválida');
  const { m } = await one('SELECT COALESCE(MAX(orden),0) AS m FROM recomendacion WHERE evento_id = ?', [e.id]);
  const sustento = String(req.body.sustento || '').trim() || `Propuesto por ${req.user.nombre} (${req.user.institucion}).`;
  const [ins] = await pool.query(
    `INSERT INTO recomendacion (evento_id, orden, titulo, sustento, instituciones, institucion_id, recursos, confianza)
     VALUES (?,?,?,?,?,?,?,NULL)`,
    [e.id, Number(m) + 1, String(req.body.titulo).trim().slice(0, 200), sustento.slice(0, 2000), inst.sigla, inst.id, String(req.body.recursos || '').slice(0, 150) || null]
  );
  await auditReq(req, 'PROPONER_ACCION', `${e.codigo} #${Number(m) + 1}`, { institucion: inst.sigla });
  emit('evento:actualizado', { id: e.id });
  res.status(201).json({ id: ins.insertId });
});

r.post('/:id/recomendaciones/generar', can('eventos.gestionar', 'recomendaciones.decidir'), async (req, res) => {
  const e = await one('SELECT id, codigo FROM evento WHERE id = ?', [req.params.id]);
  if (!e) throw notFound();
  const recs = await generarRecomendaciones(e.id);
  await auditReq(req, 'GENERAR_RECOMENDACIONES', e.codigo, { n: recs.length });
  res.json(recs);
});

r.post('/:id/cerrar', can('eventos.gestionar'), async (req, res) => {
  const e = await one('SELECT * FROM evento WHERE id = ?', [req.params.id]);
  if (!e) throw notFound();
  if (e.estado === 'Cerrado') throw conflict('El evento ya está cerrado');
  await tx(async (c) => {
    await c.query("UPDATE evento SET estado = 'Cerrado', fecha_cierre = NOW() WHERE id = ?", [e.id]);
    await c.query("UPDATE asignacion_recurso SET estado = 'Liberado', fecha_liberacion = NOW() WHERE evento_id = ? AND estado = 'Asignado'", [e.id]);
  });
  await auditReq(req, 'CERRAR_EVENTO', e.codigo);
  emit('evento:actualizado', { id: e.id });
  res.json({ ok: true });
});

/** CU-06: decisión humana sobre cada recomendación. Aprobar/modificar genera la tarea (CU-08). */
r.post('/recomendaciones/:id/decidir', can('recomendaciones.decidir'), async (req, res) => {
  const decision = String(req.body.decision || '');
  const rc = await one('SELECT rc.*, e.codigo AS evento_codigo FROM recomendacion rc JOIN evento e ON e.id = rc.evento_id WHERE rc.id = ?', [req.params.id]);
  if (!rc) throw notFound('Recomendación no encontrada');
  const obj = `${rc.evento_codigo} #${rc.orden}`;

  if (decision === 'deshacer') {
    const t = await one('SELECT * FROM tarea WHERE recomendacion_id = ?', [rc.id]);
    if (t && (t.avance > 0 || t.estado !== 'Pendiente')) throw conflict('La tarea generada ya tiene avance; no se puede deshacer');
    await tx(async (c) => {
      if (t) await c.query('DELETE FROM tarea WHERE id = ?', [t.id]);
      await c.query("UPDATE recomendacion SET estado = 'Pendiente', titulo_modificado = NULL, decidido_por = NULL, fecha_decision = NULL WHERE id = ?", [rc.id]);
    });
    await auditReq(req, 'DESHACER_DECISION', obj);
    return res.json({ ok: true });
  }

  const map = { aprobada: 'Aprobada', modificada: 'Modificada', descartada: 'Descartada' };
  if (!map[decision]) throw badRequest('Decisión inválida');
  if (rc.estado !== 'Pendiente') throw conflict('La recomendación ya fue decidida');
  if (decision === 'modificada' && !String(req.body.titulo_modificado || '').trim()) throw badRequest('Indique la acción modificada');

  let tareaCodigo = null;
  await tx(async (c) => {
    await c.query('UPDATE recomendacion SET estado = ?, titulo_modificado = ?, decidido_por = ?, fecha_decision = NOW() WHERE id = ?', [
      map[decision], decision === 'modificada' ? req.body.titulo_modificado.trim() : null, req.user.id, rc.id
    ]);
    if (decision !== 'descartada' && rc.institucion_id) {
      tareaCodigo = await nextCode('T', 3, c);
      const horas = Number(req.body.plazo_horas) || 12;
      await c.query(
        `INSERT INTO tarea (codigo, evento_id, recomendacion_id, titulo, institucion_id, responsable, plazo, estado)
         VALUES (?,?,?,?,?,?, NOW() + INTERVAL ? HOUR, 'Pendiente')`,
        [tareaCodigo, rc.evento_id, rc.id, decision === 'modificada' ? req.body.titulo_modificado.trim() : rc.titulo, rc.institucion_id, req.body.responsable || null, horas]
      );
    }
  });
  const op = { aprobada: 'APROBAR_RECOMENDACION', modificada: 'MODIFICAR_RECOMENDACION', descartada: 'DESCARTAR_RECOMENDACION' }[decision];
  await auditReq(req, op, obj, { tarea: tareaCodigo, justificacion: req.body.justificacion || null });
  if (tareaCodigo) {
    emit('tarea:nueva', { codigo: tareaCodigo }, `inst:${rc.institucion_id}`);
    emit('tarea:actualizada', { codigo: tareaCodigo });
  }
  res.json({ ok: true, tarea: tareaCodigo, institucion: rc.instituciones });
});

export default r;
