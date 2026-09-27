import { Router } from 'express';
import { q, one, pool, nextCode } from '../config/db.js';
import { can, hasPerm } from '../middleware/auth.js';
import { SQL_TAREA } from './serializers.js';
import { auditReq } from '../services/auditService.js';
import { uploadPhotos, folder } from '../middleware/upload.js';
import { badRequest, notFound, forbidden, required, conflict } from '../utils/http.js';
import { emit } from '../socket.js';
import { registrarAvance, recursosDeTareas } from '../services/taskService.js';

const r = Router();

const tareaDTO = (t) => ({
  id: t.id, codigo: t.codigo, titulo: t.titulo, evento_id: t.evento_id, evento_codigo: t.evento_codigo, evento_titulo: t.evento_titulo,
  evento_nivel: t.evento_nivel, evento_lugar: t.evento_lugar, amenaza_codigo: t.amenaza_codigo, amenaza: t.amenaza, amenaza_icono: t.amenaza_icono,
  institucion_id: t.institucion_id, institucion: t.institucion, institucion_sigla: t.institucion_sigla, responsable: t.responsable,
  plazo: t.plazo, estado: t.estado, avance: t.avance, updated_at: t.updated_at
});

/* ------------------------------ TAREAS (RF-11) ------------------------------ */
r.get('/tareas', can('coordinacion.ver'), async (req, res) => {
  const params = [];
  let where = "e.estado = 'En curso'";
  if (req.query.estado && req.query.estado !== 'Todas') { where += ' AND t.estado = ?'; params.push(req.query.estado); }
  if (req.query.evento_id) { where += ' AND t.evento_id = ?'; params.push(req.query.evento_id); }
  // Un enlace solo ve las tareas de su institución (RNF-04)
  if (!hasPerm(req.user, 'coordinacion.gestionar')) { where += ' AND t.institucion_id = ?'; params.push(req.user.institucion_id); }
  const rows = await q(`${SQL_TAREA} WHERE ${where} ORDER BY FIELD(t.estado,'Vencida','En curso','Pendiente','Completada'), t.plazo`, params);
  const all = await q(
    `SELECT t.estado, COUNT(*) AS n FROM tarea t JOIN evento e ON e.id = t.evento_id WHERE e.estado = 'En curso'
     ${hasPerm(req.user, 'coordinacion.gestionar') ? '' : 'AND t.institucion_id = ' + Number(req.user.institucion_id)} GROUP BY t.estado`
  );
  const conteo = { Todas: all.reduce((s, x) => s + Number(x.n), 0) };
  all.forEach((x) => { conteo[x.estado] = Number(x.n); });
  res.json({ tareas: rows.map(tareaDTO), conteo });
});

/** Tareas de la institución del usuario (app móvil de enlace). */
r.get('/tareas/mias', can('tareas.reportar', 'coordinacion.ver'), async (req, res) => {
  const rows = await q(`${SQL_TAREA} WHERE t.institucion_id = ? AND e.estado = 'En curso' ORDER BY FIELD(t.estado,'Vencida','En curso','Pendiente','Completada'), t.plazo`, [req.user.institucion_id]);
  res.json(rows.map(tareaDTO));
});

r.get('/tareas/:id', can('coordinacion.ver', 'tareas.reportar'), async (req, res) => {
  const t = await one(`${SQL_TAREA} WHERE t.id = ?`, [req.params.id]);
  if (!t) throw notFound('Tarea no encontrada');
  const avances = await q(
    `SELECT a.*, u.nombre AS usuario FROM tarea_avance a JOIN usuario u ON u.id = a.usuario_id WHERE a.tarea_id = ? ORDER BY a.fecha DESC`,
    [t.id]
  );
  const rec = await recursosDeTareas([t.id]);
  res.json({ ...tareaDTO(t), avances, recursos: rec[t.id] || [] });
});

r.post('/tareas', can('coordinacion.gestionar'), async (req, res) => {
  required(req.body, ['evento_id', 'titulo', 'institucion_id', 'plazo']);
  const codigo = await nextCode('T', 3);
  const [ins] = await pool.query(
    'INSERT INTO tarea (codigo, evento_id, titulo, institucion_id, responsable, plazo) VALUES (?,?,?,?,?,?)',
    [codigo, req.body.evento_id, req.body.titulo, req.body.institucion_id, req.body.responsable || null, new Date(req.body.plazo)]
  );
  await auditReq(req, 'CREAR_TAREA', codigo);
  const ev = await one('SELECT codigo, titulo, nivel FROM evento WHERE id = ?', [req.body.evento_id]);
  emit('tarea:nueva', { id: ins.insertId, codigo, titulo: req.body.titulo, plazo: new Date(req.body.plazo), evento: ev?.codigo, evento_titulo: ev?.titulo, nivel: ev?.nivel, origen: req.user.institucion }, `inst:${req.body.institucion_id}`);
  emit('tarea:actualizada', { codigo });
  res.status(201).json({ codigo });
});

r.patch('/tareas/:id', can('coordinacion.gestionar'), async (req, res) => {
  const t = await one('SELECT * FROM tarea WHERE id = ?', [req.params.id]);
  if (!t) throw notFound();
  const campos = ['titulo', 'responsable', 'plazo', 'institucion_id'];
  const set = campos.filter((c) => req.body[c] !== undefined);
  if (!set.length) throw badRequest('Nada que actualizar');
  await pool.query(`UPDATE tarea SET ${set.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
    ...set.map((c) => (c === 'plazo' ? new Date(req.body[c]) : req.body[c])), t.id
  ]);
  if (req.body.plazo && t.estado === 'Vencida' && new Date(req.body.plazo) > new Date()) {
    await pool.query("UPDATE tarea SET estado = IF(avance > 0, 'En curso', 'Pendiente') WHERE id = ?", [t.id]);
  }
  await auditReq(req, 'EDITAR_TAREA', t.codigo, req.body);
  emit('tarea:actualizada', { codigo: t.codigo });
  res.json({ ok: true });
});

/** Reporte de avance desde campo (app de enlace): % + observación + foto + GPS. */
r.post('/tareas/:id/avance', can('tareas.reportar', 'coordinacion.gestionar'), folder('tareas'), uploadPhotos, async (req, res) => {
  const t = await one('SELECT * FROM tarea WHERE id = ?', [req.params.id]);
  if (!t) throw notFound();
  if (!hasPerm(req.user, 'coordinacion.gestionar') && t.institucion_id !== req.user.institucion_id) throw forbidden('La tarea pertenece a otra institución');
  res.json({ ok: true, ...(await registrarAvance(req, t)) });
});

/* --------------------------- RECURSOS (RF-10) --------------------------- */
r.get('/recursos', can('coordinacion.ver'), async (_req, res) => {
  const rows = await q(
    `SELECT r.*, i.sigla AS institucion,
            COALESCE((SELECT SUM(cantidad) FROM asignacion_recurso a WHERE a.recurso_id = r.id AND a.estado = 'Asignado'),0) AS usados
       FROM recurso r JOIN institucion i ON i.id = r.institucion_id ORDER BY r.nombre`
  );
  res.json(rows.map((x) => ({ ...x, usados: Number(x.usados), disponibles: x.total - Number(x.usados) })));
});

r.post('/recursos', can('coordinacion.gestionar'), async (req, res) => {
  required(req.body, ['nombre', 'institucion_id', 'total']);
  const [ins] = await pool.query('INSERT INTO recurso (nombre, institucion_id, unidad, total) VALUES (?,?,?,?)', [
    req.body.nombre, req.body.institucion_id, req.body.unidad || 'unidades', Number(req.body.total)
  ]);
  await auditReq(req, 'REGISTRAR_RECURSO', req.body.nombre);
  res.status(201).json({ id: ins.insertId });
});

r.post('/recursos/:id/asignar', can('coordinacion.gestionar'), async (req, res) => {
  required(req.body, ['evento_id', 'cantidad']);
  const rc = await one(
    `SELECT r.*, COALESCE((SELECT SUM(cantidad) FROM asignacion_recurso a WHERE a.recurso_id = r.id AND a.estado = 'Asignado'),0) AS usados
       FROM recurso r WHERE r.id = ?`, [req.params.id]
  );
  if (!rc) throw notFound();
  const cant = Number(req.body.cantidad);
  if (!(cant > 0)) throw badRequest('Cantidad inválida');
  if (cant > rc.total - Number(rc.usados)) throw conflict(`Solo hay ${rc.total - Number(rc.usados)} ${rc.unidad} disponibles`);
  await pool.query('INSERT INTO asignacion_recurso (recurso_id, evento_id, cantidad, asignado_por) VALUES (?,?,?,?)', [rc.id, req.body.evento_id, cant, req.user.id]);
  const ev = await one('SELECT codigo FROM evento WHERE id = ?', [req.body.evento_id]);
  await auditReq(req, 'ASIGNAR_RECURSO', `${cant} ${rc.nombre} → ${ev?.codigo}`);
  emit('recurso:actualizado', { id: rc.id });
  res.json({ ok: true });
});

r.post('/asignaciones/:id/liberar', can('coordinacion.gestionar'), async (req, res) => {
  const a = await one('SELECT a.*, r.nombre FROM asignacion_recurso a JOIN recurso r ON r.id = a.recurso_id WHERE a.id = ?', [req.params.id]);
  if (!a) throw notFound();
  await pool.query("UPDATE asignacion_recurso SET estado = 'Liberado', fecha_liberacion = NOW() WHERE id = ?", [a.id]);
  await auditReq(req, 'LIBERAR_RECURSO', `${a.cantidad} ${a.nombre}`);
  emit('recurso:actualizado', { id: a.recurso_id });
  res.json({ ok: true });
});

export default r;
