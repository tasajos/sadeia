import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { one, q } from '../config/db.js';
import { unauthorized, forbidden } from '../utils/http.js';

/** Carga el perfil completo (rol, institución, permisos) de un usuario. */
export async function loadProfile(userId) {
  const u = await one(
    `SELECT u.id, u.username, u.email, u.nombre, u.estado, u.telefono, u.equipo_id,
            r.id AS rol_id, r.codigo AS rol, r.nombre AS rol_nombre,
            i.id AS institucion_id, i.sigla AS institucion, i.nombre AS institucion_nombre, i.icono AS institucion_icono,
            i.activa AS institucion_activa
       FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN institucion i ON i.id = u.institucion_id
      WHERE u.id = ?`,
    [userId]
  );
  if (!u) return null;
  const perms = await q(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [u.rol_id]
  );
  u.permisos = perms.map((p) => p.codigo);
  u.iniciales = u.nombre
    .replace(/^(Cnl\.|My\.|Tte\.\s?Cnl\.|Lic\.|Ing\.|Sgto\.|Gral\.|Dr\.|Arq\.)\s*/i, '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return u;
}

export const signToken = (u) =>
  jwt.sign({ sub: u.id, username: u.username, rol: u.rol }, env.jwtSecret, { expiresIn: env.jwtExpires });

/** Verifica el JWT (RF-16). Los permisos se consultan en cada petición para que un cambio de rol sea inmediato. */
export async function authenticate(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw unauthorized('Sesión expirada o token inválido');
    }
    const u = await loadProfile(payload.sub);
    if (!u) throw unauthorized('Usuario inexistente');
    if (u.estado !== 'Activo') throw unauthorized('Usuario bloqueado');
    if (!u.institucion_activa) throw unauthorized('Su institución está desactivada');
    req.user = u;
    next();
  } catch (e) {
    next(e);
  }
}

/** Control de acceso por permiso (RNF-04). Acepta uno o varios códigos (cualquiera basta). */
export const can = (...codes) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (codes.some((c) => req.user.permisos.includes(c))) return next();
  next(forbidden());
};

export const hasPerm = (user, code) => !!user?.permisos?.includes(code);
