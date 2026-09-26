import { Router } from 'express';
import { q, one, pool } from '../config/db.js';
import { can, hasPerm } from '../middleware/auth.js';
import { SQL_ALERTA, alertaDTO } from './serializers.js';
import { auditReq } from '../services/auditService.js';
import { notificarAlerta, institucionesConcernidas } from '../services/notificationService.js';
import { ALERTA_PENDIENTE, NIVELES, NIVEL_INFO } from '../services/domain.js';
import { badRequest, notFound, conflict } from '../utils/http.js';
import { emit } from '../socket.js';

const r = Router();

/** Listado de alertas (CU-03). ?estado=abiertas|todas|descartadas */
r.get('/', can('alertas.ver', 'tablero.ver'), async (req, res) => {
  const f = req.query.estado || 'abiertas';
  const where = f === 'todas' ? '1=1' : f === 'descartadas' ? "a.estado = 'Descartada'" : "a.estado NOT IN ('Descartada','Cerrada')";
  const rows = await q(`${SQL_ALERTA} WHERE ${where} ORDER BY FIELD(a.nivel,'roja','naranja','amarilla','verde'), a.created_at DESC LIMIT 200`);
  res.json(rows.map(alertaDTO));
});

/** Alertas recibidas por la institución del usuario (app de enlace). */
r.get('/recibidas', can('alertas.confirmar', 'alertas.ver'), async (req, res) => {
  const rows = await q(
    `${SQL_ALERTA} JOIN alerta_notificacion n ON n.alerta_id = a.id AND n.institucion_id = ?
      WHERE a.estado NOT IN ('Descartada','Cerrada') ORDER BY a.created_at DESC`,
    [req.user.institucion_id]
  );
  const conf = await q('SELECT alerta_id, estado, fecha_confirmacion FROM alerta_notificacion WHERE institucion_id = ?', [req.user.institucion_id]);
  res.json(rows.map((a) => ({ ...alertaDTO(a), recepcion: conf.find((c) => c.alerta_id === a.id) || null })));
});

r.get('/:id', can('alertas.ver', 'alertas.confirmar'), async (req, res) => {
  const a = await one(`${SQL_ALERTA} WHERE a.id = ? OR a.codigo = ?`, [req.params.id, req.params.id]);
  if (!a) throw notFound('Alerta no encontrada');
  const insts = await institucionesConcernidas(a);
  const notifs = await q(
    `SELECT n.*, i.sigla, i.nombre, i.icono FROM alerta_notificacion n JOIN institucion i ON i.id = n.institucion_id WHERE n.alerta_id = ?`,
    [a.id]
  );
  res.json({
    ...alertaDTO(a),
    instituciones: insts.map((i) => {
      const n = notifs.find((x) => x.institucion_id === i.id);
      return { id: i.id, sigla: i.sigla, nombre: i.nombre, icono: i.icono, estado: n?.estado || 'Pendiente', fecha_confirmacion: n?.fecha_confirmacion || null };
    })
  });
});

async function getPendiente(id) {
  const a = await one('SELECT * FROM alerta WHERE id = ?', [id]);
  if (!a) throw notFound('Alerta no encontrada');
  return a;
}

/** CU-04 · RF-07: validar y notificar (Decisor) o confirmar emisión (Operador). */
r.post('/:id/validar', can('alertas.validar', 'alertas.gestionar'), async (req, res) => {
  const a = await getPendiente(req.params.id);
  if (a.estado === 'Descartada') throw conflict('La alerta fue descartada');
  if (['Validada y notificada', 'Notificada'].includes(a.estado)) throw conflict('La alerta ya fue notificada');
  const esDecisor = hasPerm(req.user, 'alertas.validar');
  await pool.query('UPDATE alerta SET validado_por = ?, fecha_validacion = NOW() WHERE id = ?', [req.user.id, a.id]);
  await auditReq(req, esDecisor ? 'VALIDAR_ALERTA' : 'EMITIR_ALERTA', a.codigo, { nivel: a.nivel });
  const n = await notificarAlerta(a.id, esDecisor ? 'Validada y notificada' : 'Notificada');
  res.json({ ok: true, ...n });
});

/** Modificar nivel (se conserva el nivel propuesto original). */
r.post('/:id/nivel', can('alertas.validar', 'alertas.gestionar'), async (req, res) => {
  const nivel = String(req.body.nivel || '').toLowerCase();
  if (!NIVELES.includes(nivel)) throw badRequest('Nivel inválido');
  const a = await getPendiente(req.params.id);
  if (!ALERTA_PENDIENTE.includes(a.estado) && a.estado !== 'Emitida no notificada') throw conflict('Solo se modifica el nivel de alertas pendientes');
  await pool.query("UPDATE alerta SET nivel = ?, estado = 'Modificada · pendiente' WHERE id = ?", [nivel, a.id]);
  await auditReq(req, 'MODIFICAR_NIVEL', `${a.codigo} → ${NIVEL_INFO[nivel].label}`, { anterior: a.nivel, propuesto: a.nivel_propuesto, justificacion: req.body.justificacion || null });
  emit('alerta:actualizada', { id: a.id, codigo: a.codigo });
  res.json({ ok: true });
});

/** Descartar con justificación obligatoria (RF-07). */
r.post('/:id/descartar', can('alertas.validar', 'alertas.gestionar'), async (req, res) => {
  const just = String(req.body.justificacion || '').trim();
  if (just.length < 5) throw badRequest('La justificación es obligatoria (RF-07).');
  const a = await getPendiente(req.params.id);
  if (a.estado === 'Descartada') throw conflict('La alerta ya fue descartada');
  await pool.query("UPDATE alerta SET estado = 'Descartada', justificacion = ?, validado_por = ?, fecha_validacion = NOW() WHERE id = ?", [just, req.user.id, a.id]);
  await auditReq(req, 'DESCARTAR_ALERTA', a.codigo, { justificacion: just });
  emit('alerta:actualizada', { id: a.id, codigo: a.codigo, estado: 'Descartada' });
  res.json({ ok: true });
});

/** Cerrar una alerta (fin de la amenaza). */
r.post('/:id/cerrar', can('alertas.validar'), async (req, res) => {
  const a = await getPendiente(req.params.id);
  await pool.query("UPDATE alerta SET estado = 'Cerrada' WHERE id = ?", [a.id]);
  await auditReq(req, 'CERRAR_ALERTA', a.codigo);
  emit('alerta:actualizada', { id: a.id, codigo: a.codigo, estado: 'Cerrada' });
  res.json({ ok: true });
});

/** Confirmación de recepción por la institución (app de enlace). */
r.post('/:id/confirmar', can('alertas.confirmar', 'alertas.ver'), async (req, res) => {
  const a = await getPendiente(req.params.id);
  const [u] = await pool.query(
    "UPDATE alerta_notificacion SET estado = 'Confirmada', fecha_confirmacion = NOW(), confirmado_por = ? WHERE alerta_id = ? AND institucion_id = ?",
    [req.user.id, a.id, req.user.institucion_id]
  );
  if (!u.affectedRows) throw notFound('Su institución no figura entre los destinatarios de esta alerta');
  await auditReq(req, 'CONFIRMAR_RECEPCION', `${a.codigo} · ${req.user.institucion}`);
  emit('alerta:actualizada', { id: a.id, codigo: a.codigo });
  res.json({ ok: true });
});

export default r;
