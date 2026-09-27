import { Router } from 'express';
import { q, one } from '../config/db.js';
import { can } from '../middleware/auth.js';
import { SQL_ALERTA, alertaDTO, SQL_EVENTO } from './serializers.js';
import { ALERTA_ABIERTA } from '../services/domain.js';
import { DEPARTAMENTOS } from '../utils/geo.js';
import { thousands } from '../utils/format.js';

const r = Router();

/** Contadores para las insignias de la navegación y el aviso de alerta roja. */
r.get('/contadores', async (req, res) => {
  const [[a], [c], [t], roja] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM alerta WHERE estado IN ('Pendiente de validación','Modificada · pendiente')"),
    q("SELECT COUNT(*) AS n FROM reporte_ciudadano WHERE estado = 'Nuevo'"),
    q(`SELECT COUNT(*) AS n FROM tarea t JOIN evento e ON e.id = t.evento_id WHERE e.estado = 'En curso' AND t.estado = 'Vencida'
        ${req.user.permisos.includes('coordinacion.gestionar') ? '' : 'AND t.institucion_id = ' + Number(req.user.institucion_id)}`),
    q(`SELECT id, codigo, departamento FROM alerta WHERE nivel = 'roja' AND estado IN (?) ORDER BY created_at DESC`, [ALERTA_ABIERTA])
  ]);
  const esPR = req.user.permisos.includes('respuesta.ver');
  const [[pr], [tpr]] = esPR
    ? await Promise.all([
      q(`SELECT COUNT(*) AS n FROM despacho d JOIN equipo e ON e.id = d.equipo_id WHERE d.estado = 'Despachado' AND e.institucion_id = ?`, [req.user.institucion_id]),
      // Tareas del COEN / VIDECI que la institución aún no termina
      q(`SELECT COUNT(*) AS n FROM tarea t JOIN evento e ON e.id = t.evento_id WHERE e.estado = 'En curso' AND t.institucion_id = ? AND t.estado IN ('Pendiente','Vencida')`, [req.user.institucion_id])
    ])
    : [[{ n: 0 }], [{ n: 0 }]];
  res.json({
    alertas: Number(a.n), ciudadanos: Number(c.n), coordinacion: Number(t.n), respuesta: Number(pr.n), tareasPR: Number(tpr.n),
    rojas: roja.length, alertaRoja: roja[0] || null
  });
});

/** Búsqueda global: alertas, eventos, reportes ciudadanos y municipios. */
r.get('/buscar', async (req, res) => {
  const s = `%${String(req.query.q || '').trim()}%`;
  if (s.length < 4) return res.json([]);
  const [al, ev, rep] = await Promise.all([
    q(`SELECT a.id, a.codigo, a.nivel, CONCAT(am.nombre,' · ',a.lugar) AS titulo FROM alerta a JOIN amenaza am ON am.id = a.amenaza_id
        WHERE a.lugar <> 'Histórico' AND (a.codigo LIKE ? OR a.lugar LIKE ? OR am.nombre LIKE ?) ORDER BY a.created_at DESC LIMIT 6`, [s, s, s]),
    q('SELECT id, codigo, nivel, titulo FROM evento WHERE codigo LIKE ? OR titulo LIKE ? OR lugar LIKE ? ORDER BY fecha_inicio DESC LIMIT 5', [s, s, s]),
    q('SELECT id, codigo, prioridad, titulo, lugar FROM reporte_ciudadano WHERE codigo LIKE ? OR titulo LIKE ? OR lugar LIKE ? ORDER BY created_at DESC LIMIT 5', [s, s, s])
  ]);
  const p = req.user.permisos;
  res.json([
    ...(p.includes('alertas.ver') ? al.map((x) => ({ tipo: 'alerta', icon: 'campaign', ...x, ruta: `/alertas?sel=${x.id}` })) : []),
    ...(p.includes('eventos.ver') ? ev.map((x) => ({ tipo: 'evento', icon: 'emergency_home', ...x, ruta: `/eventos?sel=${x.id}` })) : []),
    ...(p.includes('ciudadanos.ver') ? rep.map((x) => ({ tipo: 'reporte', icon: 'record_voice_over', ...x, titulo: `${x.titulo} · ${x.lugar || ''}`, ruta: `/ciudadanos?sel=${x.id}` })) : [])
  ]);
});

/** CU-09 · RF-12: tablero de situación consolidado (RNF-01: < 3 s). */
r.get('/', can('tablero.ver'), async (_req, res) => {
  const t0 = Date.now();
  const [alertas, eventos, tareas, recursos, instAvance, instituciones] = await Promise.all([
    q(`${SQL_ALERTA} WHERE a.estado IN (?) ORDER BY FIELD(a.nivel,'roja','naranja','amarilla','verde'), a.created_at DESC`, [ALERTA_ABIERTA]),
    q(`${SQL_EVENTO} WHERE e.estado = 'En curso' ORDER BY FIELD(e.nivel,'roja','naranja','amarilla','verde'), e.fecha_inicio DESC`),
    q(`SELECT t.estado, i.nombre AS institucion FROM tarea t JOIN institucion i ON i.id = t.institucion_id
        JOIN evento e ON e.id = t.evento_id WHERE e.estado = 'En curso'`),
    one(`SELECT COALESCE(SUM(r.total),0) AS total,
                COALESCE((SELECT SUM(cantidad) FROM asignacion_recurso WHERE estado = 'Asignado'),0) AS usados FROM recurso r`),
    q(`SELECT i.sigla, i.nombre AS inst, COUNT(*) AS total, SUM(t.estado = 'Completada') AS done, ROUND(AVG(t.avance)) AS pct
         FROM tarea t JOIN institucion i ON i.id = t.institucion_id JOIN evento e ON e.id = t.evento_id
        WHERE e.estado = 'En curso' GROUP BY i.id ORDER BY total DESC LIMIT 6`),
    // Capa de instituciones: se actualiza sola cuando el administrador registra o mueve una institución
    q(`SELECT i.id, i.sigla, i.nombre, i.tipo, i.icono, i.sede, i.municipio, i.lat, i.lng, i.radio_km,
              (SELECT COUNT(*) FROM equipo e WHERE e.institucion_id = i.id AND e.estado = 'Disponible') AS unidades_disponibles
         FROM institucion i WHERE i.activa = 1 AND i.lat IS NOT NULL`)
  ]);

  const A = alertas.map(alertaDTO);
  const cnt = (lv) => A.filter((a) => a.nivel === lv).length;
  const vencidas = tareas.filter((t) => t.estado === 'Vencida');
  const instVencidas = [...new Set(vencidas.map((t) => t.institucion))];
  const pctRec = Number(recursos.total) ? Math.round((Number(recursos.usados) / Number(recursos.total)) * 100) : 0;

  // Puntos del mapa: alertas abiertas + departamentos sin alerta en monitoreo
  const depConAlerta = new Set(A.map((a) => a.departamento));
  const mapa = [
    ...A.filter((a) => a.lat).map((a) => ({ tipo: 'alerta', id: a.id, codigo: a.codigo, lat: a.lat, lng: a.lng, nivel: a.nivel, titulo: `${a.amenaza} · ${a.lugar}`, detalle: `${a.codigo} · Prob. ${String(a.probabilidad).replace('.', ',')} · ${a.horizonte}` })),
    ...Object.entries(DEPARTAMENTOS).filter(([d]) => !depConAlerta.has(d)).map(([d, [lat, lng]]) => ({ tipo: 'monitoreo', lat, lng, nivel: 'verde', titulo: `Monitoreo · ${d}`, detalle: 'Sin alerta activa' }))
  ];

  const roja = A.find((a) => a.nivel === 'roja');
  res.json({
    kpis: [
      { label: 'Alertas activas', value: String(A.length), icon: 'campaign', note: `${cnt('roja')} roja · ${cnt('naranja')} naranja · ${cnt('amarilla')} amarillas`, tone: cnt('roja') ? 'danger' : 'muted' },
      { label: 'Eventos en curso', value: String(eventos.length), icon: 'emergency_home', note: [...new Set(eventos.map((e) => e.departamento))].join(' · ') || '—', tone: 'muted' },
      { label: 'Recursos comprometidos', value: `${pctRec} %`, icon: 'inventory_2', note: `${thousands(recursos.usados)} de ${thousands(recursos.total)} unidades`, tone: 'muted' },
      { label: 'Tareas vencidas', value: String(vencidas.length), icon: 'schedule', note: instVencidas.join(' · ') || 'Ninguna', tone: vencidas.length ? 'warning' : 'muted' }
    ],
    alertaRoja: roja ? { id: roja.id, codigo: roja.codigo, lugar: roja.lugar, departamento: roja.departamento } : null,
    alertas: A,
    eventos: eventos.map((e) => ({
      id: e.id, codigo: e.codigo, titulo: e.titulo, nivel: e.nivel, fecha_inicio: e.fecha_inicio, impacto: e.impacto, icono: e.icono,
      lugar: e.lugar, lat: e.lat != null ? Number(e.lat) : null, lng: e.lng != null ? Number(e.lng) : null,
      radio_km: e.radio_km != null ? Number(e.radio_km) : null, ubicacion_aprox: !!e.ubicacion_aprox
    })),
    avanceInstituciones: instAvance.map((i) => ({ ...i, total: Number(i.total), done: Number(i.done), pct: Number(i.pct) || 0 })),
    mapa,
    instituciones: instituciones.map((i) => ({ ...i, unidades_disponibles: Number(i.unidades_disponibles) })),
    consultaMs: Date.now() - t0,
    generado: new Date()
  });
});

export default r;
