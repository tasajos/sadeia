import { Router } from 'express';
import crypto from 'node:crypto';
import { q, one, pool } from '../config/db.js';
import { can, authenticate, hasPerm } from '../middleware/auth.js';
import { auditReq, audit } from '../services/auditService.js';
import { ingerir, sincronizar, ADAPTADORES, invalidarCacheVariables } from '../services/ingestService.js';
import { badRequest, notFound, required, unauthorized, forbidden, clientIp } from '../utils/http.js';
import { thousands, dec } from '../utils/format.js';

const r = Router();

/**
 * Ingesta push (RF-01): las fuentes envían lecturas con su clave (x-api-key),
 * o un analista las carga manualmente con su token.
 * Body: { fuente_id?, lecturas: [{estacion, departamento, municipio, lat, lng, variable, valor, fecha_hora}] }
 */
r.post('/ingesta', async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key) {
    const f = await one("SELECT * FROM fuente_datos WHERE api_key = ? AND estado <> 'Inactiva'", [key]);
    if (!f) throw unauthorized('Clave de fuente inválida');
    req.fuente = f;
    return next();
  }
  return authenticate(req, res, (err) => {
    if (err) return next(err);
    if (!hasPerm(req.user, 'fuentes.gestionar')) return next(forbidden());
    next();
  });
}, async (req, res) => {
  const lecturas = Array.isArray(req.body) ? req.body : req.body.lecturas;
  if (!Array.isArray(lecturas) || !lecturas.length) throw badRequest('Envíe un arreglo "lecturas"');
  if (lecturas.length > 5000) throw badRequest('Máximo 5.000 lecturas por lote');
  const fuente = req.fuente || (await one('SELECT * FROM fuente_datos WHERE id = ?', [req.body.fuente_id]));
  if (!fuente) throw badRequest('Indique fuente_id');
  const out = await ingerir(fuente, lecturas);
  await audit({ usuario: req.user?.username || `fuente:${fuente.id}`, operacion: 'INGESTA_LOTE', objeto: fuente.nombre, ip: clientIp(req), detalle: { aceptadas: out.aceptadas, descartadas: out.descartadas } });
  res.json({ ...out, detalleDescartes: out.detalleDescartes.slice(0, 50) });
});

// Todas las rutas siguientes requieren sesión.
r.use(authenticate);

r.get('/fuentes', can('fuentes.ver'), async (_req, res) => {
  const rows = await q(
    `SELECT f.id, f.nombre, f.adaptador, f.url, f.periodicidad_min, f.ultima_sinc, f.calidad, f.estado, f.ultimo_error,
            i.sigla, i.nombre AS institucion
       FROM fuente_datos f JOIN institucion i ON i.id = f.institucion_id ORDER BY f.id`
  );
  res.json(rows);
});

r.get('/fuentes/kpis', can('fuentes.ver'), async (_req, res) => {
  const [a] = await q(
    `SELECT (SELECT COUNT(*) FROM fuente_datos WHERE estado <> 'Inactiva') AS fuentes,
            (SELECT COUNT(*) FROM lectura WHERE fecha_hora >= CURDATE()) AS hoy,
            (SELECT COUNT(*) FROM lectura_descartada WHERE fecha_hora >= CURDATE()) AS desc_hoy,
            (SELECT AVG(TIMESTAMPDIFF(MINUTE, ultima_sinc, NOW())) FROM fuente_datos WHERE ultima_sinc IS NOT NULL AND estado = 'Operativa') AS lat`
  );
  const total = Number(a.hoy) + Number(a.desc_hoy);
  res.json([
    { label: 'Fuentes configuradas', value: String(a.fuentes) },
    { label: 'Lecturas hoy', value: thousands(a.hoy) },
    { label: 'Descartadas', value: `${dec(total ? (Number(a.desc_hoy) / total) * 100 : 0, 1)} %` },
    { label: 'Latencia media', value: a.lat != null ? `${Math.round(a.lat)} min` : '—' }
  ]);
});

r.post('/fuentes', can('fuentes.gestionar'), async (req, res) => {
  required(req.body, ['nombre', 'institucion_id', 'adaptador']);
  if (!ADAPTADORES[req.body.adaptador]) throw badRequest(`Adaptador no soportado. Disponibles: ${Object.keys(ADAPTADORES).join(', ')}`);
  const apiKey = crypto.randomBytes(20).toString('hex');
  const [ins] = await pool.query(
    'INSERT INTO fuente_datos (nombre, institucion_id, adaptador, url, api_key, periodicidad_min) VALUES (?,?,?,?,?,?)',
    [req.body.nombre, req.body.institucion_id, req.body.adaptador, req.body.url || null, apiKey, Number(req.body.periodicidad_min) || 15]
  );
  await auditReq(req, 'REGISTRAR_FUENTE', req.body.nombre);
  res.status(201).json({ id: ins.insertId, api_key: apiKey });
});

r.patch('/fuentes/:id', can('fuentes.gestionar'), async (req, res) => {
  const f = await one('SELECT * FROM fuente_datos WHERE id = ?', [req.params.id]);
  if (!f) throw notFound();
  const campos = ['nombre', 'adaptador', 'url', 'periodicidad_min', 'estado'].filter((c) => req.body[c] !== undefined);
  if (!campos.length) throw badRequest('Nada que actualizar');
  await pool.query(`UPDATE fuente_datos SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...campos.map((c) => req.body[c]), f.id]);
  await auditReq(req, 'EDITAR_FUENTE', f.nombre, req.body);
  res.json({ ok: true });
});

r.post('/fuentes/:id/clave', can('fuentes.gestionar'), async (req, res) => {
  const apiKey = crypto.randomBytes(20).toString('hex');
  const [u] = await pool.query('UPDATE fuente_datos SET api_key = ? WHERE id = ?', [apiKey, req.params.id]);
  if (!u.affectedRows) throw notFound();
  await auditReq(req, 'REGENERAR_CLAVE_FUENTE', String(req.params.id));
  res.json({ api_key: apiKey });
});

r.post('/fuentes/:id/sincronizar', can('fuentes.gestionar'), async (req, res) => {
  const f = await one('SELECT * FROM fuente_datos WHERE id = ?', [req.params.id]);
  if (!f) throw notFound();
  const out = await sincronizar(f);
  await auditReq(req, 'SINCRONIZAR_FUENTE', f.nombre, { resultado: out.error || out.aceptadas });
  res.json(out);
});

r.get('/lecturas/descartadas', can('fuentes.ver'), async (req, res) => {
  const rows = await q(
    `SELECT d.*, f.nombre AS fuente FROM lectura_descartada d JOIN fuente_datos f ON f.id = d.fuente_id
      WHERE d.fecha_hora >= NOW() - INTERVAL ? HOUR ORDER BY d.fecha_hora DESC LIMIT 100`,
    [Number(req.query.horas) || 24]
  );
  res.json(rows);
});

/** Serie temporal de una estación/variable (para gráficos). */
r.get('/lecturas', can('fuentes.ver', 'alertas.ver'), async (req, res) => {
  const params = [];
  let where = 'l.fecha_hora >= NOW() - INTERVAL ? HOUR';
  params.push(Number(req.query.horas) || 72);
  if (req.query.municipio) { where += ' AND l.municipio = ?'; params.push(req.query.municipio); }
  if (req.query.variable) { where += ' AND v.codigo = ?'; params.push(req.query.variable); }
  const rows = await q(
    `SELECT l.fecha_hora, l.estacion, l.valor, v.codigo AS variable, v.unidad FROM lectura l JOIN variable v ON v.id = l.variable_id
      WHERE ${where} ORDER BY l.fecha_hora LIMIT 2000`,
    params
  );
  res.json(rows);
});

/* ------------- Configuración de amenazas y umbrales (RNF-09) ------------- */
r.get('/variables', can('fuentes.ver', 'modelos.ver'), async (_req, res) => res.json(await q('SELECT * FROM variable ORDER BY nombre')));

r.post('/variables', can('fuentes.gestionar'), async (req, res) => {
  required(req.body, ['codigo', 'nombre', 'unidad']);
  await pool.query('INSERT INTO variable (codigo, nombre, unidad, min_fisico, max_fisico, max_salto) VALUES (?,?,?,?,?,?)', [
    req.body.codigo, req.body.nombre, req.body.unidad, req.body.min_fisico ?? null, req.body.max_fisico ?? null, req.body.max_salto ?? null
  ]);
  invalidarCacheVariables();
  await auditReq(req, 'REGISTRAR_VARIABLE', req.body.codigo);
  res.status(201).json({ ok: true });
});

r.get('/umbrales', can('fuentes.ver', 'modelos.ver'), async (_req, res) => {
  res.json(await q(
    `SELECT u.*, a.nombre AS amenaza, a.codigo AS amenaza_codigo, v.nombre AS variable, v.unidad
       FROM umbral u JOIN amenaza a ON a.id = u.amenaza_id JOIN variable v ON v.id = u.variable_id ORDER BY a.id, u.id`
  ));
});

r.put('/umbrales/:id', can('modelos.reentrenar', 'fuentes.gestionar'), async (req, res) => {
  const u = await one('SELECT * FROM umbral WHERE id = ?', [req.params.id]);
  if (!u) throw notFound();
  const campos = ['valor', 'base', 'escala_max', 'peso', 'operador', 'region'].filter((c) => req.body[c] !== undefined);
  await pool.query(`UPDATE umbral SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...campos.map((c) => req.body[c]), u.id]);
  await auditReq(req, 'MODIFICAR_UMBRAL', `umbral #${u.id}`, { antes: u.valor, despues: req.body.valor });
  res.json({ ok: true });
});

export default r;
