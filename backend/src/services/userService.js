import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { badRequest } from '../utils/http.js';

export const passwordTemporal = () => crypto.randomBytes(6).toString('base64url') + '9!';

/**
 * Crea un usuario. Si no se indica contraseña, genera una temporal y la devuelve
 * (se muestra una sola vez a quien lo creó). En ambos casos la contraseña la conoce otra persona:
 * se exige cambiarla en el primer inicio de sesión.
 */
export async function crearUsuario(data, conn = pool) {
  const temporal = data.password || passwordTemporal();
  if (temporal.length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres');
  const [ins] = await conn.query(
    'INSERT INTO usuario (username, email, nombre, password_hash, rol_id, institucion_id, equipo_id, telefono, debe_cambiar_password) VALUES (?,?,?,?,?,?,?,?,1)',
    [String(data.username).trim().toLowerCase(), String(data.email).trim().toLowerCase(), data.nombre, await bcrypt.hash(temporal, 10),
      data.rol_id, data.institucion_id, data.equipo_id || null, data.telefono || null]
  );
  return { id: ins.insertId, password_temporal: data.password ? undefined : temporal };
}

/** Reemplaza las especialidades de un usuario (solo las de su institución). */
export async function asignarEspecialidades(usuarioId, institucionId, ids, conn = pool) {
  if (!Array.isArray(ids)) return;
  await conn.query('DELETE FROM usuario_especialidad WHERE usuario_id = ?', [usuarioId]);
  const limpios = [...new Set(ids.map(Number).filter(Boolean))];
  if (!limpios.length) return;
  const [validas] = await conn.query('SELECT id FROM especialidad WHERE institucion_id = ? AND id IN (?)', [institucionId, limpios]);
  if (validas.length) await conn.query('INSERT INTO usuario_especialidad (usuario_id, especialidad_id) VALUES ?', [validas.map((e) => [usuarioId, e.id])]);
}
