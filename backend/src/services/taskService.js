import { q, pool } from '../config/db.js';
import { auditReq } from './auditService.js';
import { publicPath } from '../middleware/upload.js';
import { badRequest } from '../utils/http.js';
import { emit } from '../socket.js';

/**
 * Registra el avance de una tarea (% + observación + foto + GPS). Lo usan Coordinación, la app de enlace
 * y el módulo de primera respuesta. Al completarse, los recursos movilizados vuelven a estar disponibles.
 */
export async function registrarAvance(req, t) {
  const avance = Math.max(0, Math.min(100, Number(req.body.avance)));
  if (req.body.avance === undefined || req.body.avance === '' || Number.isNaN(avance)) throw badRequest('Avance inválido');
  const foto = req.files?.[0] ? publicPath(req.files[0]) : null;
  await pool.query(
    'INSERT INTO tarea_avance (tarea_id, usuario_id, avance, observacion, foto, lat, lng, fecha) VALUES (?,?,?,?,?,?,?,?)',
    [t.id, req.user.id, avance, req.body.observacion || null, foto, req.body.lat || null, req.body.lng || null, req.body.fecha ? new Date(req.body.fecha) : new Date()]
  );
  const estado = avance >= 100 ? 'Completada' : t.estado === 'Vencida' ? 'Vencida' : avance > 0 ? 'En curso' : 'Pendiente';
  await pool.query('UPDATE tarea SET avance = ?, estado = ? WHERE id = ?', [avance, estado, t.id]);
  if (estado === 'Completada') {
    await pool.query("UPDATE tarea_recurso SET estado = 'Retornado', fecha_retorno = NOW() WHERE tarea_id = ? AND estado = 'Movilizado'", [t.id]);
  }
  await auditReq(req, 'ACTUALIZAR_TAREA', `${t.codigo} → ${avance} %`, { observacion: req.body.observacion });
  emit('tarea:actualizada', { codigo: t.codigo, avance, estado });
  return { estado, avance };
}

/** Recursos movilizados de varias tareas, agrupados por tarea (para el COEN y la institución). */
export async function recursosDeTareas(ids) {
  if (!ids.length) return {};
  const rows = await q(
    `SELECT tr.id, tr.tarea_id, tr.tipo, tr.ref_id, tr.descripcion, tr.cantidad, tr.unidad, tr.estado, tr.fecha, tr.fecha_retorno, u.nombre AS usuario
       FROM tarea_recurso tr JOIN usuario u ON u.id = tr.usuario_id WHERE tr.tarea_id IN (?) ORDER BY tr.estado = 'Retornado', tr.fecha DESC`,
    [ids]
  );
  return rows.reduce((m, x) => ((m[x.tarea_id] ||= []).push(x), m), {});
}
