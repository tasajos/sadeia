import { q } from '../config/db.js';
import { distanceKm, DEPARTAMENTOS } from '../utils/geo.js';
import { TIPOS_REPORTE, ALERTA_ABIERTA } from './domain.js';
import { dec } from '../utils/format.js';

/**
 * Triaje automático de reportes ciudadanos (Motor IA):
 *  - Clasificación del tipo por categoría elegida + palabras clave de la descripción.
 *  - Prioridad: personas en riesgo → CRÍTICA; coincidencia con alerta roja/naranja → ALTA; etc.
 *  - Vinculación a la alerta/evento activo más cercano del mismo tipo.
 *  - Detección de duplicados en 300 m durante las últimas 2 h.
 */
const KEYWORDS = {
  inundacion: ['agua', 'inund', 'río', 'rio', 'crecida', 'desborde', 'cintura', 'rebalse'],
  incendio: ['fuego', 'humo', 'incendio', 'quema', 'llamas', 'chaqueo'],
  deslizamiento: ['derrumbe', 'deslizamiento', 'mazamorra', 'cerro', 'tierra', 'piedras', 'talud'],
  tormenta: ['granizo', 'viento', 'techo', 'tormenta', 'rayo', 'calamina'],
  personas: ['atrapad', 'herid', 'techo', 'ayuda', 'niño', 'abuel', 'desaparec']
};
const VITAL = ['atrapad', 'herid', 'inconsciente', 'no pueden salir', 'arrastr', 'desaparec', 'techo'];

function clasificar(tipo, desc) {
  const text = (desc || '').toLowerCase();
  const scores = Object.fromEntries(Object.keys(KEYWORDS).map((k) => [k, KEYWORDS[k].filter((w) => text.includes(w)).length]));
  if (TIPOS_REPORTE[tipo]) scores[tipo] = (scores[tipo] || 0) + 2;
  const [best, s] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const conf = Math.min(0.97, 0.6 + (s / total) * 0.35 + (tipo === best ? 0.05 : 0));
  return { tipo: best, conf: Math.round(conf * 100) / 100 };
}

export function departamentoMasCercano(lat, lng) {
  return Object.entries(DEPARTAMENTOS)
    .map(([d, [la, ln]]) => [d, distanceKm(lat, lng, la, ln)])
    .sort((a, b) => a[1] - b[1])[0][0];
}

export async function triaje({ tipo, descripcion, lat, lng, personas_riesgo }) {
  const c = clasificar(tipo, descripcion);
  const label = TIPOS_REPORTE[c.tipo]?.label || 'Otro';
  const amenazaCod = TIPOS_REPORTE[c.tipo]?.amenaza || TIPOS_REPORTE[tipo]?.amenaza;
  const text = (descripcion || '').toLowerCase();
  const riesgoVital = !!personas_riesgo || VITAL.some((w) => text.includes(w));

  // Alerta/evento activo cercano (≤ 60 km) del mismo tipo de amenaza
  const alertas = await q(
    `SELECT a.id, a.codigo, a.nivel, a.lat, a.lng, am.codigo AS am FROM alerta a JOIN amenaza am ON am.id = a.amenaza_id
      WHERE a.estado IN (?) AND a.lat IS NOT NULL`,
    [ALERTA_ABIERTA]
  );
  const eventos = await q(
    `SELECT e.id, e.codigo, e.nivel, e.lat, e.lng, am.codigo AS am FROM evento e JOIN amenaza am ON am.id = e.amenaza_id
      WHERE e.estado = 'En curso' AND e.lat IS NOT NULL`
  );
  const cercano = (rows) =>
    rows
      .map((r) => ({ ...r, km: distanceKm(lat, lng, Number(r.lat), Number(r.lng)) }))
      .filter((r) => r.km <= 60 && (!amenazaCod || r.am === amenazaCod))
      .sort((a, b) => a.km - b.km)[0];
  const alerta = cercano(alertas);
  const evento = cercano(eventos);

  // Duplicados
  const recientes = await q(
    `SELECT codigo, lat, lng FROM reporte_ciudadano WHERE created_at >= NOW() - INTERVAL 2 HOUR AND estado <> 'Falso / descartado'`
  );
  const dups = recientes.filter((r) => distanceKm(lat, lng, Number(r.lat), Number(r.lng)) <= 0.3);

  let prioridad = 'BAJA';
  if (riesgoVital) prioridad = 'CRÍTICA';
  else if (alerta && ['roja', 'naranja'].includes(alerta.nivel)) prioridad = 'ALTA';
  else if (['inundacion', 'incendio', 'deslizamiento'].includes(c.tipo)) prioridad = 'MEDIA';

  const notas = [];
  if (alerta) notas.push(`Coincide con ${alerta.codigo} (${alerta.nivel}).`);
  else if (evento) notas.push(`Dentro del área de ${evento.codigo}.`);
  else notas.push('Sin alerta activa en la zona.');
  if (riesgoVital) notas.push('Personas en riesgo vital: se recomienda despacho inmediato.');
  else if (prioridad === 'BAJA') notas.push('Daño material: se sugiere derivar al GAM.');

  return {
    prioridad,
    ia_tipo: riesgoVital && c.tipo !== 'personas' ? `${label} · rescate` : label,
    ia_confianza: c.conf,
    ia_nota: notas.join(' '),
    duplicados: dups.length ? `${dups.length} reporte(s) a menos de 300 m: ${dups.map((d) => d.codigo).join(', ')}` : 'ninguno en 300 m',
    alerta_id: alerta?.id ?? null,
    evento_id: evento?.id ?? null,
    departamento: departamentoMasCercano(lat, lng),
    distanciaAlertaKm: alerta ? dec(alerta.km, 1) : null
  };
}
