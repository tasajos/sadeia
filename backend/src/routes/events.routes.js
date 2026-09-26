import { Router } from 'express';
import { q, one, pool, nextCode, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { SQL_EVENTO } from './serializers.js';
import { auditReq } from '../services/auditService.js';
import { generarRecomendaciones } from '../services/recommendationService.js';
import { NIVELES } from '../services/domain.js';
import { badRequest, notFound, conflict, required } from '../utils/http.js';
import { emit } from '../socket.js';

const r = Router();

const eventoDTO = (e) => ({
  id: e.id, codigo: e.codigo, titulo: e.titulo, amenaza: e.amenaza, amenaza_id: e.amenaza_id, icono: e.icono,
  alerta_id: e.alerta_id, alerta_codigo: e.alerta_codigo, departamento: e.departamento, lugar: e.lugar, lat: e.lat, lng: e.lng,
  nivel: e.nivel, fecha_inicio: e.fecha_inicio, fecha_cierre: e.fecha_cierre, impacto: e.impacto,
  usa_protocolo: !!e.usa_protocolo, estado: e.estado
});

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
  res.json({ ...eventoDTO(e), recomendaciones: recs, recursos });
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
  const [ins] = await pool.query(
    `INSERT INTO evento (codigo, titulo, amenaza_id, alerta_id, departamento, lugar, lat, lng, nivel, fecha_inicio, impacto, registrado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [codigo, titulo, am.id, alerta?.id ?? null, req.body.departamento, req.body.lugar,
      req.body.lat ?? alerta?.lat ?? null, req.body.lng ?? alerta?.lng ?? null, req.body.nivel,
      req.body.fecha_inicio ? new Date(req.body.fecha_inicio) : new Date(), req.body.impacto || null, req.user.id]
  );
  await auditReq(req, 'REGISTRAR_EVENTO', codigo, { alerta: alerta?.codigo });
  const recs = await generarRecomendaciones(ins.insertId);
  emit('evento:nuevo', { id: ins.insertId, codigo, titulo });
  res.status(201).json({ id: ins.insertId, codigo, recomendaciones: recs.length });
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
