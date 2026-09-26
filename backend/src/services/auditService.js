import { pool } from '../config/db.js';
import { clientIp } from '../utils/http.js';
import { emit } from '../socket.js';

/**
 * Registra una operación en la bitácora inalterable (RF-15, RNF-10).
 * Solo INSERT: la tabla tiene triggers que bloquean UPDATE/DELETE.
 */
export async function audit({ usuario, operacion, objeto = null, ip = null, detalle = null }, conn = pool) {
  const [r] = await conn.query(
    'INSERT INTO bitacora (usuario, operacion, objeto, ip, detalle) VALUES (?, ?, ?, ?, ?)',
    [usuario || 'sistema', operacion, objeto, ip, detalle ? JSON.stringify(detalle) : null]
  );
  emit('bitacora:nueva', { id: r.insertId, usuario, operacion, objeto, ip, fecha_hora: new Date() }, 'perm:bitacora.ver');
  return r.insertId;
}

/** Atajo para registrar desde una request autenticada. */
export const auditReq = (req, operacion, objeto, detalle, conn) =>
  audit({ usuario: req.user?.username || 'anonimo', operacion, objeto, ip: clientIp(req), detalle }, conn);
