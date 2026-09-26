import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q, one, pool, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { auditReq } from '../services/auditService.js';
import { badRequest, notFound, required } from '../utils/http.js';

const r = Router();

/* ------------------------- Catálogos (lectura) ------------------------- */
r.get('/catalogos', async (_req, res) => {
  const [instituciones, roles, amenazas, equipos] = await Promise.all([
    q('SELECT id, sigla, nombre, tipo, departamento, icono FROM institucion WHERE activa = 1 ORDER BY nombre'),
    q('SELECT id, codigo, nombre, descripcion FROM rol ORDER BY id'),
    q('SELECT id, codigo, nombre, icono, horizonte FROM amenaza WHERE activa = 1 ORDER BY id'),
    q('SELECT id, codigo, nombre FROM equipo ORDER BY codigo')
  ]);
  res.json({ instituciones, roles, amenazas, equipos });
});

/* ------------------------ Usuarios (CU-11 · RF-14) ------------------------ */
r.get('/usuarios', can('admin.usuarios'), async (_req, res) => {
  res.json(await q(
    `SELECT u.id, u.username, u.email, u.nombre, u.estado, u.ultimo_acceso, u.telefono, u.equipo_id,
            r.id AS rol_id, r.nombre AS rol, i.id AS institucion_id, i.sigla AS institucion, e.codigo AS equipo
       FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN institucion i ON i.id = u.institucion_id
       LEFT JOIN equipo e ON e.id = u.equipo_id ORDER BY u.id`
  ));
});

r.post('/usuarios', can('admin.usuarios'), async (req, res) => {
  required(req.body, ['username', 'email', 'nombre', 'rol_id', 'institucion_id']);
  const temporal = req.body.password || crypto.randomBytes(6).toString('base64url') + '9!';
  if (temporal.length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres');
  const [ins] = await pool.query(
    'INSERT INTO usuario (username, email, nombre, password_hash, rol_id, institucion_id, equipo_id, telefono) VALUES (?,?,?,?,?,?,?,?)',
    [req.body.username.toLowerCase(), req.body.email.toLowerCase(), req.body.nombre, await bcrypt.hash(temporal, 10),
      req.body.rol_id, req.body.institucion_id, req.body.equipo_id || null, req.body.telefono || null]
  );
  await auditReq(req, 'CREAR_USUARIO', req.body.username);
  res.status(201).json({ id: ins.insertId, password_temporal: req.body.password ? undefined : temporal });
});

r.patch('/usuarios/:id', can('admin.usuarios'), async (req, res) => {
  const u = await one('SELECT u.*, r.nombre AS rol FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = ?', [req.params.id]);
  if (!u) throw notFound();
  const campos = ['nombre', 'email', 'rol_id', 'institucion_id', 'estado', 'equipo_id', 'telefono'].filter((c) => req.body[c] !== undefined);
  if (!campos.length) throw badRequest('Nada que actualizar');
  await pool.query(`UPDATE usuario SET ${campos.map((c) => `${c} = ?`).join(', ')}${req.body.estado === 'Activo' ? ', intentos_fallidos = 0' : ''} WHERE id = ?`, [
    ...campos.map((c) => (req.body[c] === '' ? null : req.body[c])), u.id
  ]);
  if (req.body.rol_id && Number(req.body.rol_id) !== u.rol_id) {
    const nr = await one('SELECT nombre FROM rol WHERE id = ?', [req.body.rol_id]);
    await auditReq(req, 'MODIFICAR_ROL', `${u.username} → ${nr?.nombre}`);
  }
  if (req.body.estado && req.body.estado !== u.estado) await auditReq(req, req.body.estado === 'Bloqueado' ? 'BLOQUEAR_USUARIO' : 'DESBLOQUEAR_USUARIO', u.username);
  if (!req.body.rol_id && !req.body.estado) await auditReq(req, 'EDITAR_USUARIO', u.username);
  res.json({ ok: true });
});

r.post('/usuarios/:id/reset-password', can('admin.usuarios'), async (req, res) => {
  const u = await one('SELECT username FROM usuario WHERE id = ?', [req.params.id]);
  if (!u) throw notFound();
  const temporal = crypto.randomBytes(6).toString('base64url') + '9!';
  await pool.query('UPDATE usuario SET password_hash = ?, intentos_fallidos = 0 WHERE id = ?', [await bcrypt.hash(temporal, 10), req.params.id]);
  await auditReq(req, 'RESTABLECER_CONTRASENA', u.username);
  res.json({ password_temporal: temporal });
});

/* ----------------------- Roles y permisos (RNF-04) ----------------------- */
r.get('/roles', can('admin.roles', 'admin.usuarios'), async (_req, res) => {
  const [roles, permisos, rp] = await Promise.all([
    q('SELECT * FROM rol ORDER BY id'),
    q('SELECT * FROM permiso ORDER BY orden, id'),
    q('SELECT * FROM rol_permiso')
  ]);
  res.json({
    roles,
    permisos: permisos.map((p) => ({ ...p, roles: rp.filter((x) => x.permiso_id === p.id).map((x) => x.rol_id) }))
  });
});

r.put('/roles/:id/permisos', can('admin.roles'), async (req, res) => {
  const rol = await one('SELECT * FROM rol WHERE id = ?', [req.params.id]);
  if (!rol) throw notFound();
  const ids = (req.body.permisos || []).map(Number).filter(Boolean);
  if (rol.codigo === 'ADMIN') {
    const adm = await one("SELECT id FROM permiso WHERE codigo = 'admin.roles'");
    if (!ids.includes(adm.id)) throw badRequest('El rol Administrador no puede perder la gestión de roles');
  }
  await tx(async (c) => {
    await c.query('DELETE FROM rol_permiso WHERE rol_id = ?', [rol.id]);
    if (ids.length) await c.query('INSERT INTO rol_permiso (rol_id, permiso_id) VALUES ?', [ids.map((p) => [rol.id, p])]);
  });
  await auditReq(req, 'MODIFICAR_PERMISOS', rol.nombre, { permisos: ids.length });
  res.json({ ok: true });
});

/* -------------------- Bitácora inalterable (RF-15 · RNF-10) -------------------- */
r.get('/bitacora', can('bitacora.ver'), async (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.query.usuario) { where += ' AND usuario = ?'; params.push(req.query.usuario); }
  if (req.query.operacion) { where += ' AND operacion = ?'; params.push(req.query.operacion); }
  if (req.query.desde) { where += ' AND fecha_hora >= ?'; params.push(new Date(req.query.desde)); }
  if (req.query.hasta) { where += ' AND fecha_hora <= ?'; params.push(new Date(req.query.hasta)); }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const rows = await q(`SELECT * FROM bitacora WHERE ${where} ORDER BY fecha_hora DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [{ total }] = await q(`SELECT COUNT(*) AS total FROM bitacora WHERE ${where}`, params);
  res.json({ total: Number(total), filas: rows });
});

// No existen rutas PUT/DELETE para la bitácora: es inalterable por diseño.

export default r;
