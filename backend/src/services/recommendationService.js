import { q, one, pool } from '../config/db.js';
import { parseJson, dec } from '../utils/format.js';

/**
 * Generación de cursos de acción priorizados (RF-09, CU-06).
 * Base de conocimiento por amenaza: cada regla describe la acción, la institución
 * responsable, los recursos y cómo se construye su sustento a partir de la evidencia.
 * Si el histórico de eventos del mismo tipo en el departamento es insuficiente,
 * se aplica el protocolo normado (flujo 3.a) y la confianza queda como "protocolo".
 */
const fmtVar = (vars, codigo) => {
  const v = vars.find((x) => x.codigo === codigo);
  if (!v) return null;
  return `${v.name} ${dec(v.val, Number.isInteger(v.val) ? 0 : 2)} ${v.unidad} (umbral ${dec(v.thr, Number.isInteger(v.thr) ? 0 : 2)} ${v.unidad})`;
};
const ev = (vars, ...codes) => codes.map((c) => fmtVar(vars, c)).filter(Boolean).join('; ');

const KB = {
  INU: [
    { titulo: (e) => `Evacuación preventiva de zonas ribereñas en ${e.lugar}`, sustento: (v) => `Evidencia: ${ev(v, 'nivel_rio', 'tendencia_nivel')}. Viviendas bajo la cota de inundación histórica.`, inst: 'FF.AA. + GAM', sigla: 'FFAA', rec: '6 botes · 4 camiones', w: 1.05 },
    { titulo: () => 'Habilitar albergues temporales en unidades educativas de zona alta', sustento: (v) => `Evidencia: ${ev(v, 'precip_72h', 'humedad_suelo')}. En eventos previos el 60 % de las familias evacuadas requirió albergue.`, inst: 'Gobernación', sigla: 'GOB', rec: '300 carpas · raciones', w: 0.97 },
    { titulo: () => 'Pre-posicionar helicóptero de la FAB', sustento: () => 'El modelo estima corte de acceso terrestre a comunidades aisladas dentro del horizonte de la alerta.', inst: 'FF.AA. · FAB', sigla: 'FFAA', rec: '1 helicóptero', w: 0.83 },
    { titulo: () => 'Instalar motobombas en canales de drenaje urbano', sustento: (v) => `Evidencia: ${ev(v, 'humedad_suelo', 'precip_72h')}. Los canales registran rebalse con precipitaciones sobre el umbral.`, inst: 'GAM', sigla: 'GAM', rec: '2 motobombas', w: 0.76 }
  ],
  INC: [
    { titulo: (e) => `Reforzar brigadas en el frente activo de ${e.lugar}`, sustento: (v) => `Evidencia: ${ev(v, 'focos_calor_24h', 'viento')}.`, inst: 'Gobernación', sigla: 'GOB', rec: '120 brigadistas', w: 1.0 },
    { titulo: () => 'Solicitar avión cisterna para descargas en zona de difícil acceso', sustento: (v) => `Evidencia: ${ev(v, 'dias_sin_lluvia')}. Parte del perímetro activo está lejos de caminos transitables.`, inst: 'VIDECI · FF.AA.', sigla: 'VIDECI', rec: '1 avión cisterna', w: 0.85 },
    { titulo: () => 'Evacuación preventiva de comunidades en la dirección del viento', sustento: (v) => `Evidencia: ${ev(v, 'viento')}.`, inst: 'FF.AA. + Policía', sigla: 'FFAA', rec: '4 camiones', w: 0.8 }
  ],
  DES: [
    { titulo: () => 'Evacuación de viviendas en franja de 50 m del talud', sustento: (v) => `Evidencia: ${ev(v, 'saturacion_suelo', 'pendiente_talud')}.`, inst: 'GAM + Policía', sigla: 'GAM', rec: '2 camiones', w: 1.0 },
    { titulo: () => 'Cierre preventivo del tramo vial expuesto', sustento: (v) => `Cierre preventivo ante saturación de suelo superior al umbral. ${ev(v, 'precip_24h')}.`, inst: 'Policía Boliviana', sigla: 'POL', rec: 'Tránsito', w: 0.9 }
  ],
  HEL: [
    { titulo: () => 'Distribución de kits de abrigo a población vulnerable', sustento: (v) => `Evidencia: ${ev(v, 'temp_min')}.`, inst: 'Gobernación', sigla: 'GOB', rec: 'Kits de abrigo', w: 0.95 },
    { titulo: () => 'Aviso agroclimático a productores para protección de cultivos', sustento: (v) => `Evidencia: ${ev(v, 'temp_min', 'nubosidad')}.`, inst: 'SENAMHI + Gobernación', sigla: 'SENAMHI', rec: 'Boletín', w: 0.85 }
  ],
  GRA: [
    { titulo: () => 'Aviso a unidades educativas y mercados para resguardo', sustento: (v) => `Evidencia: ${ev(v, 'cape', 'reflectividad')}.`, inst: 'GAM', sigla: 'GAM', rec: 'Avisos', w: 0.9 },
    { titulo: () => 'Pre-posicionar cuadrillas para limpieza de sumideros', sustento: () => 'Acumulación de granizo obstruye el drenaje urbano en eventos previos.', inst: 'GAM', sigla: 'GAM', rec: '2 cuadrillas', w: 0.8 }
  ],
  SEQ: [
    { titulo: () => 'Distribución de agua mediante cisternas a comunidades afectadas', sustento: (v) => `Evidencia: ${ev(v, 'spi3', 'deficit_precip')}.`, inst: 'Gobernación + VIDECI', sigla: 'GOB', rec: '6 cisternas', w: 0.95 },
    { titulo: () => 'Declaratoria de emergencia municipal y priorización de pozos', sustento: (v) => `Evidencia: ${ev(v, 'deficit_precip')}.`, inst: 'GAM', sigla: 'GAM', rec: 'Perforadora', w: 0.8 }
  ]
};

const PROTOCOLO = {
  DES: [
    { titulo: () => 'Evacuación de viviendas en franja de 50 m del talud', sustento: () => 'Protocolo normado de deslizamientos. Sin histórico suficiente para inferencia del modelo en esta zona.', inst: 'GAM + Policía', sigla: 'GAM', rec: '2 camiones' },
    { titulo: () => 'Cierre del tramo vial expuesto', sustento: () => 'Protocolo normado: cierre preventivo ante saturación de suelo superior al 80 %.', inst: 'Policía Boliviana', sigla: 'POL', rec: 'Tránsito' }
  ],
  DEFAULT: [
    { titulo: () => 'Activar el COE departamental y evaluar daños (EDAN)', sustento: () => 'Protocolo normado de respuesta. Histórico insuficiente para inferencia.', inst: 'Gobernación', sigla: 'GOB', rec: 'Equipo EDAN' },
    { titulo: () => 'Resguardar a la población expuesta según plan de contingencia', sustento: () => 'Protocolo normado de respuesta.', inst: 'GAM', sigla: 'GAM', rec: 'Según plan' }
  ]
};

/** Resuelve la institución destinataria de la tarea según la sigla genérica y el departamento. */
async function resolverInstitucion(sigla, departamento) {
  if (sigla === 'GOB' || sigla === 'GAM') {
    const tipo = sigla === 'GOB' ? 'Departamental' : 'Municipal';
    const i = await one('SELECT id, nombre FROM institucion WHERE tipo = ? AND departamento = ? ORDER BY id LIMIT 1', [tipo, departamento]);
    if (i) return i;
    return one("SELECT id, nombre FROM institucion WHERE sigla = 'VIDECI'");
  }
  return one('SELECT id, nombre FROM institucion WHERE sigla = ?', [sigla]);
}

export async function generarRecomendaciones(eventoId) {
  const e = await one(
    `SELECT e.*, am.codigo AS amenaza_codigo, a.sustento, a.probabilidad
       FROM evento e JOIN amenaza am ON am.id = e.amenaza_id LEFT JOIN alerta a ON a.id = e.alerta_id WHERE e.id = ?`,
    [eventoId]
  );
  if (!e) return [];
  const vars = parseJson(e.sustento, []);
  const [{ n }] = await q(
    "SELECT COUNT(*) AS n FROM evento WHERE amenaza_id = ? AND departamento = ? AND id <> ? AND estado = 'Cerrado'",
    [e.amenaza_id, e.departamento, e.id]
  );
  const usaProtocolo = Number(n) < 2 && !vars.length;
  const reglas = usaProtocolo ? PROTOCOLO[e.amenaza_codigo] || PROTOCOLO.DEFAULT : KB[e.amenaza_codigo] || PROTOCOLO.DEFAULT;
  const base = Number(e.probabilidad) || 0.75;

  await pool.query("DELETE FROM recomendacion WHERE evento_id = ? AND estado = 'Pendiente'", [e.id]);
  await pool.query('UPDATE evento SET usa_protocolo = ? WHERE id = ?', [usaProtocolo ? 1 : 0, e.id]);
  const ordenInicial = (await one('SELECT COALESCE(MAX(orden),0) AS m FROM recomendacion WHERE evento_id = ?', [e.id])).m;

  const recs = reglas
    .map((r) => ({ ...r, conf: usaProtocolo ? null : Math.min(0.99, Math.round(base * (r.w || 1) * 100) / 100) }))
    .sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));
  let orden = ordenInicial;
  for (const r of recs) {
    const inst = await resolverInstitucion(r.sigla, e.departamento);
    await pool.query(
      `INSERT INTO recomendacion (evento_id, orden, titulo, sustento, instituciones, institucion_id, recursos, confianza)
       VALUES (?,?,?,?,?,?,?,?)`,
      [e.id, ++orden, r.titulo(e), r.sustento(vars), r.inst, inst?.id ?? null, r.rec, r.conf]
    );
  }
  return q('SELECT * FROM recomendacion WHERE evento_id = ? ORDER BY orden', [e.id]);
}
