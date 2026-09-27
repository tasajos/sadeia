import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, one, pool, tx } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { auditReq } from '../services/auditService.js';
import { detalleReporte } from '../services/citizenService.js';
import { aceptarMision, rechazarMision, avanzarMision } from '../services/missionService.js';
import { crearUsuario, asignarEspecialidades, passwordTemporal } from '../services/userService.js';
import { distanceKm } from '../utils/geo.js';
import { badRequest, conflict, forbidden, notFound, required } from '../utils/http.js';
import { emit } from '../socket.js';

/**
 * Módulo de la institución de primera respuesta. Todo se limita a la institución del usuario:
 * cada institución tiene su propio equipo de primera respuesta, personal, unidades y recursos.
 */
const r = Router();

/** Roles que una institución puede asignar a su propio personal (nunca roles de administración). */
const ROLES_ASIGNABLES = ['PRIMERA_RESPUESTA', 'ENLACE'];

const miInstitucion = (req) => one('SELECT * FROM institucion WHERE id = ?', [req.user.institucion_id]);

/* --------------------------------- Resumen --------------------------------- */
r.get('/resumen', can('respuesta.ver'), async (req, res) => {
  const id = req.user.institucion_id;
  const [inst, [c], roles, unidades, vehiculos] = await Promise.all([
    miInstitucion(req),
    q(`SELECT (SELECT COUNT(*) FROM usuario WHERE institucion_id = ?) AS usuarios,
              (SELECT COUNT(*) FROM equipo WHERE institucion_id = ?) AS unidades,
              (SELECT COUNT(*) FROM vehiculo WHERE institucion_id = ?) AS vehiculos,
              (SELECT COUNT(*) FROM equipamiento WHERE institucion_id = ?) AS equipamiento,
              (SELECT COUNT(*) FROM especialidad WHERE institucion_id = ?) AS especialidades`, [id, id, id, id, id]),
    q('SELECT id, codigo, nombre FROM rol WHERE codigo IN (?) ORDER BY id', [ROLES_ASIGNABLES]),
    q('SELECT id, codigo, nombre, estado FROM equipo WHERE institucion_id = ? ORDER BY codigo', [id]),
    q('SELECT id, codigo, tipo FROM vehiculo WHERE institucion_id = ? ORDER BY codigo', [id])
  ]);
  const especialidades = await q('SELECT id, nombre, icono FROM especialidad WHERE institucion_id = ? ORDER BY nombre', [id]);
  res.json({ institucion: inst, contadores: c, roles, unidades, vehiculos, especialidades });
});

/* ------------------- Emergencias despachadas en la jurisdicción ------------------- */
r.get('/emergencias', can('respuesta.ver'), async (req, res) => {
  const inst = await miInstitucion(req);
  const unidades = await q('SELECT id, codigo, nombre, icono, lat, lng, estado, tripulacion FROM equipo WHERE institucion_id = ? ORDER BY codigo', [inst.id]);
  const reps = await q(
    `SELECT id, codigo, titulo, icono, lugar, departamento, lat, lng, prioridad, estado, created_at FROM reporte_ciudadano
      WHERE estado <> 'Falso / descartado' AND (estado <> 'Atendido' OR created_at >= NOW() - INTERVAL 72 HOUR)
      ORDER BY created_at DESC LIMIT 300`
  );
  const ids = reps.map((x) => x.id);
  const desp = ids.length ? await q(
    `SELECT d.id, d.reporte_id, d.estado, d.eta_min, d.distancia_km, d.fecha_despacho, e.id AS equipo_id, e.codigo AS equipo, e.institucion_id, i.sigla AS institucion
       FROM despacho d JOIN equipo e ON e.id = d.equipo_id JOIN institucion i ON i.id = e.institucion_id
      WHERE d.reporte_id IN (?) ORDER BY d.fecha_despacho`, [ids]
  ) : [];
  const conUbicacion = inst.lat != null && inst.lng != null;
  const lista = reps
    .map((x) => {
      const despachos = desp.filter((d) => d.reporte_id === x.id).map((d) => ({ ...d, mio: d.institucion_id === inst.id }));
      const km = conUbicacion ? distanceKm(Number(inst.lat), Number(inst.lng), Number(x.lat), Number(x.lng)) : null;
      return {
        ...x, despachos,
        distancia_km: km == null ? null : Math.round(km * 10) / 10,
        en_jurisdiccion: km != null && km <= inst.radio_km,
        mio: despachos.some((d) => d.mio && d.estado !== 'Rechazada')
      };
    })
    .filter((x) => x.mio || x.en_jurisdiccion)
    .sort((a, b) => Number(b.mio) - Number(a.mio) || new Date(b.created_at) - new Date(a.created_at));
  res.json({ institucion: inst, unidades, emergencias: lista });
});

r.get('/emergencias/:id', can('respuesta.ver'), async (req, res) => {
  const inst = await miInstitucion(req);
  const rep = await one('SELECT id, lat, lng FROM reporte_ciudadano WHERE id = ?', [req.params.id]);
  if (!rep) throw notFound('Emergencia no encontrada');
  const propio = await one(
    `SELECT COUNT(*) AS n FROM despacho d JOIN equipo e ON e.id = d.equipo_id
      WHERE d.reporte_id = ? AND e.institucion_id = ? AND d.estado <> 'Rechazada'`, [rep.id, inst.id]
  );
  const mio = Number(propio.n) > 0;
  const enJurisdiccion = inst.lat != null && distanceKm(Number(inst.lat), Number(inst.lng), Number(rep.lat), Number(rep.lng)) <= inst.radio_km;
  if (!mio && !enJurisdiccion) throw forbidden('La emergencia está fuera de la jurisdicción de su institución');
  // Los datos del reportante solo se muestran a la institución que atiende la emergencia.
  const det = await detalleReporte(rep.id, { publico: !mio });
  if (det.equipos) delete det.equipos;
  const despachos = await q(
    `SELECT d.id, d.estado, d.eta_min, d.distancia_km, d.fecha_despacho, d.fecha_aceptacion, d.fecha_llegada, d.fecha_control,
            e.id AS equipo_id, e.codigo AS equipo, e.nombre AS equipo_nombre, e.lat, e.lng, i.sigla AS institucion, (e.institucion_id = ?) AS mio
       FROM despacho d JOIN equipo e ON e.id = d.equipo_id JOIN institucion i ON i.id = e.institucion_id
      WHERE d.reporte_id = ? ORDER BY d.fecha_despacho`, [inst.id, rep.id]
  );
  res.json({ ...det, mio, despachos: despachos.map((d) => ({ ...d, mio: !!d.mio })) });
});

/** Atender despachos de las unidades de la institución (misma lógica que la app móvil). */
async function despachoPropio(req) {
  const d = await one('SELECT * FROM despacho WHERE id = ?', [req.params.id]);
  if (!d) throw notFound('Despacho no encontrado');
  const eq = await one('SELECT * FROM equipo WHERE id = ?', [d.equipo_id]);
  if (eq.institucion_id !== req.user.institucion_id) throw forbidden('El despacho corresponde a otra institución');
  return { eq, d };
}
r.post('/despachos/:id/aceptar', can('respuesta.atender'), async (req, res) => {
  const { eq, d } = await despachoPropio(req);
  res.json(await aceptarMision(req, eq, d));
});
r.post('/despachos/:id/rechazar', can('respuesta.atender'), async (req, res) => {
  const { eq, d } = await despachoPropio(req);
  res.json(await rechazarMision(req, eq, d));
});
r.post('/despachos/:id/avanzar', can('respuesta.atender'), async (req, res) => {
  const { eq, d } = await despachoPropio(req);
  res.json(await avanzarMision(req, eq, d));
});

/* --------------------------- Validadores de campos --------------------------- */
// `def`: valor para columnas NOT NULL cuando el campo llega vacío.
const str = (max, req = false, def = null) => (v, nombre) => {
  if (v === undefined) return undefined;
  const s = v === null ? '' : String(v).trim();
  if (!s) { if (req) throw badRequest(`${nombre} es obligatorio`); return def; }
  return s.slice(0, max);
};
const int = (min, max, def = null) => (v, nombre) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${nombre} inválido`);
  return n;
};
const dec = (min, max) => (v, nombre) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (v === null || v === '' || !Number.isFinite(n) || n < min || n > max) throw badRequest(`${nombre} inválido`);
  return n;
};
const oneOf = (vals) => (v, nombre) => {
  if (v === undefined) return undefined;
  if (!vals.includes(v)) throw badRequest(`${nombre} inválido`);
  return v;
};
const icono = (v) => {
  if (v === undefined || v === null || v === '') return undefined; // se conserva el actual o el valor por defecto
  if (!/^[a-z0-9_]{2,40}$/.test(String(v))) throw badRequest('Ícono inválido');
  return v;
};
/** Referencia a un registro de la MISMA institución (unidad o vehículo). */
const propio = (tabla) => async (v, nombre, instId) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const row = await one(`SELECT id FROM ${tabla} WHERE id = ? AND institucion_id = ?`, [v, instId]);
  if (!row) throw badRequest(`${nombre} no pertenece a su institución`);
  return row.id;
};

async function parse(body, campos, instId, parcial) {
  const out = {};
  for (const [k, [fn, nombre, obligatorio]] of Object.entries(campos)) {
    if (!parcial && obligatorio && (body[k] === undefined || body[k] === null || body[k] === '')) throw badRequest(`${nombre} es obligatorio`);
    const v = await fn(body[k], nombre, instId);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * CRUD de recursos propios de la institución (vehículos, equipamiento, especialidades).
 * Cada registro queda ligado a req.user.institucion_id y nadie más puede verlo ni editarlo.
 */
function recurso(ruta, { tabla, campos, listar, etiqueta, operacion }) {
  r.get(`/${ruta}`, can('respuesta.ver'), async (req, res) => {
    res.json(await q(listar, [req.user.institucion_id]));
  });
  r.post(`/${ruta}`, can('respuesta.recursos'), async (req, res) => {
    const data = await parse(req.body, campos, req.user.institucion_id, false);
    const cols = Object.keys(data);
    const [ins] = await pool.query(`INSERT INTO ${tabla} (institucion_id, ${cols.join(', ')}) VALUES (?)`, [[req.user.institucion_id, ...cols.map((k) => data[k])]]);
    await auditReq(req, `REGISTRAR_${operacion}`, `${req.user.institucion} · ${etiqueta(data)}`);
    emit('respuesta:recursos', { tabla }, `inst:${req.user.institucion_id}`);
    res.status(201).json({ id: ins.insertId });
  });
  r.patch(`/${ruta}/:id`, can('respuesta.recursos'), async (req, res) => {
    const actual = await one(`SELECT * FROM ${tabla} WHERE id = ? AND institucion_id = ?`, [req.params.id, req.user.institucion_id]);
    if (!actual) throw notFound();
    const data = await parse(req.body, campos, req.user.institucion_id, true);
    const cols = Object.keys(data);
    if (!cols.length) throw badRequest('Nada que actualizar');
    await pool.query(`UPDATE ${tabla} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...cols.map((k) => data[k]), actual.id]);
    await auditReq(req, `EDITAR_${operacion}`, `${req.user.institucion} · ${etiqueta({ ...actual, ...data })}`);
    emit('respuesta:recursos', { tabla }, `inst:${req.user.institucion_id}`);
    res.json({ ok: true });
  });
  r.delete(`/${ruta}/:id`, can('respuesta.recursos'), async (req, res) => {
    const actual = await one(`SELECT * FROM ${tabla} WHERE id = ? AND institucion_id = ?`, [req.params.id, req.user.institucion_id]);
    if (!actual) throw notFound();
    await pool.query(`DELETE FROM ${tabla} WHERE id = ?`, [actual.id]);
    await auditReq(req, `ELIMINAR_${operacion}`, `${req.user.institucion} · ${etiqueta(actual)}`);
    emit('respuesta:recursos', { tabla }, `inst:${req.user.institucion_id}`);
    res.json({ ok: true });
  });
}

recurso('vehiculos', {
  tabla: 'vehiculo',
  operacion: 'VEHICULO',
  etiqueta: (v) => `${v.codigo} (${v.tipo})`,
  campos: {
    codigo: [str(20, true), 'Código', true],
    placa: [str(20), 'Placa'],
    tipo: [str(40, true), 'Tipo de vehículo', true],
    marca_modelo: [str(80), 'Marca y modelo'],
    anio: [int(1950, 2100), 'Año'],
    capacidad: [str(80), 'Capacidad'],
    estado: [oneOf(['Operativo', 'En mantenimiento', 'Fuera de servicio']), 'Estado'],
    equipo_id: [propio('equipo'), 'La unidad'],
    observacion: [str(255), 'Observación']
  },
  listar: `SELECT v.*, e.codigo AS unidad, (SELECT COUNT(*) FROM equipamiento q WHERE q.vehiculo_id = v.id) AS equipamiento
             FROM vehiculo v LEFT JOIN equipo e ON e.id = v.equipo_id WHERE v.institucion_id = ? ORDER BY v.codigo`
});

recurso('equipamiento', {
  tabla: 'equipamiento',
  operacion: 'EQUIPAMIENTO',
  etiqueta: (x) => `${x.nombre}${x.cantidad != null ? ` × ${x.cantidad}` : ''}`,
  campos: {
    nombre: [str(100, true), 'Nombre', true],
    categoria: [str(40, true), 'Categoría', true],
    cantidad: [int(0, 1000000, 1), 'Cantidad'],
    unidad: [str(30, false, 'unidades'), 'Unidad de medida'],
    estado: [oneOf(['Operativo', 'En mantenimiento', 'De baja']), 'Estado'],
    vehiculo_id: [propio('vehiculo'), 'El vehículo'],
    observacion: [str(255), 'Observación']
  },
  listar: `SELECT q.*, v.codigo AS vehiculo FROM equipamiento q LEFT JOIN vehiculo v ON v.id = q.vehiculo_id
            WHERE q.institucion_id = ? ORDER BY q.categoria, q.nombre`
});

recurso('especialidades', {
  tabla: 'especialidad',
  operacion: 'ESPECIALIDAD',
  etiqueta: (x) => x.nombre,
  campos: {
    nombre: [str(80, true), 'Nombre', true],
    descripcion: [str(255), 'Descripción'],
    icono: [icono, 'Ícono']
  },
  listar: `SELECT s.*, (SELECT COUNT(*) FROM usuario_especialidad ue WHERE ue.especialidad_id = s.id) AS personal
             FROM especialidad s WHERE s.institucion_id = ? ORDER BY s.nombre`
});

/* ------------- Unidades de respuesta (las que reciben despachos del COEN) ------------- */
const CAMPOS_UNIDAD = {
  codigo: [(v, n) => { const s = str(20, true)(v, n); return s === undefined ? s : s.toUpperCase(); }, 'Código', true],
  nombre: [str(100, true), 'Nombre', true],
  tripulacion: [str(100), 'Tripulación'],
  icono: [icono, 'Ícono'],
  lat: [dec(-90, 90), 'Latitud', true],
  lng: [dec(-180, 180), 'Longitud', true],
  estado: [oneOf(['Disponible', 'Fuera de servicio']), 'Estado']
};

r.get('/unidades', can('respuesta.ver'), async (req, res) => {
  res.json(await q(
    `SELECT e.*, (SELECT COUNT(*) FROM usuario u WHERE u.equipo_id = e.id) AS personal,
            (SELECT COUNT(*) FROM vehiculo v WHERE v.equipo_id = e.id) AS vehiculos
       FROM equipo e WHERE e.institucion_id = ? ORDER BY e.codigo`, [req.user.institucion_id]
  ));
});

r.post('/unidades', can('respuesta.recursos'), async (req, res) => {
  const d = await parse(req.body, CAMPOS_UNIDAD, req.user.institucion_id, false);
  const [ins] = await pool.query(
    'INSERT INTO equipo (codigo, nombre, institucion_id, tripulacion, icono, lat, lng, ubicacion_at, estado) VALUES (?,?,?,?,?,?,?,NOW(),?)',
    [d.codigo, d.nombre, req.user.institucion_id, d.tripulacion ?? null, d.icono || req.user.institucion_icono || 'emergency', d.lat, d.lng, d.estado || 'Disponible']
  );
  await auditReq(req, 'REGISTRAR_UNIDAD', `${req.user.institucion} · ${d.codigo}`);
  emit('equipo:ubicacion', { id: ins.insertId, codigo: d.codigo, lat: d.lat, lng: d.lng }, ['perm:ciudadanos.ver', `inst:${req.user.institucion_id}`]);
  res.status(201).json({ id: ins.insertId });
});

r.patch('/unidades/:id', can('respuesta.recursos'), async (req, res) => {
  const eq = await one('SELECT * FROM equipo WHERE id = ? AND institucion_id = ?', [req.params.id, req.user.institucion_id]);
  if (!eq) throw notFound();
  const d = await parse(req.body, CAMPOS_UNIDAD, req.user.institucion_id, true);
  if (d.estado && eq.estado === 'En misión') throw conflict(`${eq.codigo} está en misión: su estado cambia al cerrar la misión`);
  const cols = Object.keys(d);
  if (!cols.length) throw badRequest('Nada que actualizar');
  await pool.query(`UPDATE equipo SET ${cols.map((k) => `${k} = ?`).join(', ')}${d.lat !== undefined ? ', ubicacion_at = NOW()' : ''} WHERE id = ?`, [...cols.map((k) => d[k]), eq.id]);
  await auditReq(req, 'EDITAR_UNIDAD', `${req.user.institucion} · ${d.codigo || eq.codigo}`, d.estado ? { estado: d.estado } : undefined);
  emit('equipo:ubicacion', { id: eq.id, codigo: d.codigo || eq.codigo }, ['perm:ciudadanos.ver', `inst:${req.user.institucion_id}`]);
  res.json({ ok: true });
});

/* ------------------------- Personal de la institución ------------------------- */
r.get('/usuarios', can('respuesta.usuarios'), async (req, res) => {
  const [users, esp] = await Promise.all([
    q(`SELECT u.id, u.username, u.email, u.nombre, u.telefono, u.estado, u.ultimo_acceso, u.equipo_id, e.codigo AS equipo,
              r.id AS rol_id, r.codigo AS rol_codigo, r.nombre AS rol
         FROM usuario u JOIN rol r ON r.id = u.rol_id LEFT JOIN equipo e ON e.id = u.equipo_id
        WHERE u.institucion_id = ? ORDER BY u.nombre`, [req.user.institucion_id]),
    q(`SELECT ue.usuario_id, s.id, s.nombre, s.icono FROM usuario_especialidad ue JOIN especialidad s ON s.id = ue.especialidad_id
        WHERE s.institucion_id = ?`, [req.user.institucion_id])
  ]);
  res.json(users.map((u) => ({
    ...u,
    editable: ROLES_ASIGNABLES.includes(u.rol_codigo),
    especialidades: esp.filter((x) => x.usuario_id === u.id).map(({ id, nombre, icono: ic }) => ({ id, nombre, icono: ic }))
  })));
});

async function rolAsignable(rolId) {
  const rol = await one('SELECT id, codigo, nombre FROM rol WHERE id = ?', [rolId]);
  if (!rol || !ROLES_ASIGNABLES.includes(rol.codigo)) throw forbidden('Solo puede asignar los roles Equipo de primera respuesta o Enlace');
  return rol;
}

async function unidadPropia(equipoId, instId) {
  if (!equipoId) return null;
  const eq = await one('SELECT id FROM equipo WHERE id = ? AND institucion_id = ?', [equipoId, instId]);
  if (!eq) throw badRequest('La unidad no pertenece a su institución');
  return eq.id;
}

r.post('/usuarios', can('respuesta.usuarios'), async (req, res) => {
  required(req.body, ['username', 'email', 'nombre', 'rol_id']);
  const instId = req.user.institucion_id;
  await rolAsignable(req.body.rol_id);
  const equipoId = await unidadPropia(req.body.equipo_id, instId);
  const nuevo = await tx(async (c) => {
    const u = await crearUsuario({ ...req.body, institucion_id: instId, equipo_id: equipoId }, c);
    await asignarEspecialidades(u.id, instId, req.body.especialidades || [], c);
    return u;
  });
  await auditReq(req, 'CREAR_USUARIO', `${req.body.username} · ${req.user.institucion}`);
  res.status(201).json(nuevo);
});

async function usuarioPropio(req) {
  const u = await one('SELECT u.*, r.codigo AS rol_codigo FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = ? AND u.institucion_id = ?',
    [req.params.id, req.user.institucion_id]);
  if (!u) throw notFound('Usuario no encontrado en su institución');
  if (!ROLES_ASIGNABLES.includes(u.rol_codigo)) throw forbidden('Este usuario solo puede ser administrado por el administrador del sistema');
  return u;
}

r.patch('/usuarios/:id', can('respuesta.usuarios'), async (req, res) => {
  const u = await usuarioPropio(req);
  const b = req.body;
  if (b.estado !== undefined && !['Activo', 'Bloqueado'].includes(b.estado)) throw badRequest('Estado inválido');
  if (b.estado === 'Bloqueado' && u.id === req.user.id) throw badRequest('No puede bloquear su propio usuario');
  if (b.rol_id !== undefined) await rolAsignable(b.rol_id);
  const data = {
    nombre: b.nombre, email: b.email?.trim().toLowerCase(), telefono: b.telefono === '' ? null : b.telefono, estado: b.estado,
    rol_id: b.rol_id, equipo_id: b.equipo_id === undefined ? undefined : await unidadPropia(b.equipo_id, req.user.institucion_id)
  };
  const cols = Object.keys(data).filter((k) => data[k] !== undefined);
  await tx(async (c) => {
    if (cols.length) {
      await c.query(`UPDATE usuario SET ${cols.map((k) => `${k} = ?`).join(', ')}${b.estado === 'Activo' ? ', intentos_fallidos = 0' : ''} WHERE id = ?`,
        [...cols.map((k) => data[k]), u.id]);
    }
    if (Array.isArray(b.especialidades)) await asignarEspecialidades(u.id, req.user.institucion_id, b.especialidades, c);
  });
  const op = b.estado && b.estado !== u.estado ? (b.estado === 'Bloqueado' ? 'BLOQUEAR_USUARIO' : 'DESBLOQUEAR_USUARIO') : 'EDITAR_USUARIO';
  await auditReq(req, op, `${u.username} · ${req.user.institucion}`);
  res.json({ ok: true });
});

r.post('/usuarios/:id/reset-password', can('respuesta.usuarios'), async (req, res) => {
  const u = await usuarioPropio(req);
  const temporal = passwordTemporal();
  await pool.query('UPDATE usuario SET password_hash = ?, intentos_fallidos = 0, debe_cambiar_password = 1 WHERE id = ?', [await bcrypt.hash(temporal, 10), u.id]);
  await auditReq(req, 'RESTABLECER_CONTRASENA', `${u.username} · ${req.user.institucion}`);
  res.json({ password_temporal: temporal });
});

export default r;
