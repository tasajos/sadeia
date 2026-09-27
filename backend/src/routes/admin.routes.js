import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, one, pool, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { auditReq } from '../services/auditService.js';
import { crearUsuario, passwordTemporal } from '../services/userService.js';
import { validarInstitucion, CAMPOS_INSTITUCION } from '../services/institutionService.js';
import { badRequest, conflict, notFound, required } from '../utils/http.js';
import { emit } from '../socket.js';

const r = Router();

/* ------------------------- Catálogos (lectura) ------------------------- */
r.get('/catalogos', async (_req, res) => {
  const [instituciones, roles, amenazas, equipos] = await Promise.all([
    q('SELECT id, sigla, nombre, tipo, departamento, icono, lat, lng FROM institucion WHERE activa = 1 ORDER BY nombre'),
    q('SELECT id, codigo, nombre, descripcion FROM rol ORDER BY id'),
    q('SELECT id, codigo, nombre, icono, horizonte FROM amenaza WHERE activa = 1 ORDER BY id'),
    q('SELECT id, codigo, nombre, institucion_id FROM equipo ORDER BY codigo')
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
  const nuevo = await crearUsuario(req.body);
  await auditReq(req, 'CREAR_USUARIO', req.body.username);
  res.status(201).json(nuevo);
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
  const temporal = passwordTemporal();
  await pool.query('UPDATE usuario SET password_hash = ?, intentos_fallidos = 0, debe_cambiar_password = 1 WHERE id = ?', [await bcrypt.hash(temporal, 10), req.params.id]);
  await auditReq(req, 'RESTABLECER_CONTRASENA', u.username);
  res.json({ password_temporal: temporal });
});

/* ------------- Instituciones: ubicación, jurisdicción y acceso al sistema ------------- */
const SQL_INSTITUCIONES = `
  SELECT i.*,
         (SELECT COUNT(*) FROM usuario u WHERE u.institucion_id = i.id) AS usuarios,
         (SELECT COUNT(*) FROM equipo e WHERE e.institucion_id = i.id) AS unidades,
         (SELECT COUNT(*) FROM vehiculo v WHERE v.institucion_id = i.id) AS vehiculos
    FROM institucion i`;

r.get('/instituciones', can('admin.instituciones'), async (_req, res) => {
  res.json(await q(`${SQL_INSTITUCIONES} ORDER BY i.activa DESC, i.nombre`));
});

/**
 * Alta de institución con su ubicación en el mapa. Opcionalmente crea su primera unidad de respuesta
 * (para que pueda recibir despachos) y su primer usuario "Equipo de primera respuesta" (para que acceda al sistema).
 */
r.post('/instituciones', can('admin.instituciones'), async (req, res) => {
  required(req.body, ['sigla', 'nombre', 'tipo', 'lat', 'lng']);
  const data = validarInstitucion(req.body);
  const acceso = req.body.acceso;
  if (acceso) required(acceso, ['username', 'nombre', 'email']);
  const rolPR = acceso ? await one("SELECT id FROM rol WHERE codigo = 'PRIMERA_RESPUESTA'") : null;
  if (acceso && !rolPR) throw badRequest('No existe el rol Equipo de primera respuesta');

  const out = await tx(async (c) => {
    const cols = CAMPOS_INSTITUCION.filter((k) => data[k] !== undefined);
    const [ins] = await c.query(`INSERT INTO institucion (${cols.join(', ')}) VALUES (?)`, [cols.map((k) => data[k])]);
    const id = ins.insertId;
    let unidad = null;
    if (req.body.crear_unidad) {
      const codigo = String(req.body.unidad_codigo || `${data.sigla}-01`).trim().toUpperCase().slice(0, 20);
      const [[dup]] = await c.query('SELECT id FROM equipo WHERE codigo = ?', [codigo]);
      if (dup) throw conflict(`Ya existe una unidad con el código ${codigo}`);
      const [u] = await c.query(
        'INSERT INTO equipo (codigo, nombre, institucion_id, tripulacion, icono, lat, lng, ubicacion_at) VALUES (?,?,?,?,?,?,?,NOW())',
        [codigo, String(req.body.unidad_nombre || `Unidad de primera respuesta · ${data.sigla}`).slice(0, 100), id,
          req.body.unidad_tripulacion || null, data.icono || 'emergency', data.lat, data.lng]
      );
      unidad = { id: u.insertId, codigo };
    }
    let usuario = null;
    if (acceso) {
      const nu = await crearUsuario({ ...acceso, rol_id: rolPR.id, institucion_id: id, equipo_id: unidad?.id }, c);
      usuario = { id: nu.id, username: String(acceso.username).trim().toLowerCase(), password_temporal: nu.password_temporal };
    }
    return { id, unidad, usuario };
  });
  await auditReq(req, 'CREAR_INSTITUCION', `${data.sigla} · ${data.nombre}`, { lat: data.lat, lng: data.lng, unidad: out.unidad?.codigo, usuario: out.usuario?.username });
  emit('institucion:actualizada', { id: out.id });
  res.status(201).json(out);
});

r.patch('/instituciones/:id', can('admin.instituciones'), async (req, res) => {
  const inst = await one('SELECT * FROM institucion WHERE id = ?', [req.params.id]);
  if (!inst) throw notFound();
  const data = validarInstitucion(req.body, true);
  if (data.activa === 0 && inst.id === req.user.institucion_id) throw badRequest('No puede desactivar su propia institución');
  const cols = CAMPOS_INSTITUCION.filter((k) => data[k] !== undefined);
  if (!cols.length) throw badRequest('Nada que actualizar');
  await pool.query(`UPDATE institucion SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...cols.map((k) => data[k]), inst.id]);
  const op = data.activa === 0 ? 'DESACTIVAR_INSTITUCION' : data.activa === 1 && !inst.activa ? 'ACTIVAR_INSTITUCION' : 'EDITAR_INSTITUCION';
  await auditReq(req, op, inst.sigla, cols.includes('lat') ? { lat: data.lat, lng: data.lng } : undefined);
  emit('institucion:actualizada', { id: inst.id });
  res.json({ ok: true });
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
