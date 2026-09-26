import { env } from '../config/env.js';
import { nivelDesdeProbabilidad } from './domain.js';

/**
 * Motor de inferencia explicable (RF-03, RNF-05).
 *
 * Si AI_SERVICE_URL está configurado, delega en el microservicio Python/scikit-learn
 * (POST /predict) y usa su probabilidad. En cualquier caso la explicación se construye
 * con los umbrales normados de la BD, de modo que toda clasificación indica qué variables
 * y umbrales la determinaron.
 *
 * Motor integrado: índice de excedencia ponderado → función logística.
 *   e_i = (valor_i − umbral_i) / (escala_i − umbral_i)   (sirve para umbrales >= y <=)
 *   s   = Σ w_i·e_i / Σ w_i
 *   p   = 1 / (1 + exp(−K·s))        K = 3,2  (s = 0 → p = 0,5 → umbral de alerta amarilla)
 */
const K = 3.2;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Construye la explicación de cada variable (valor observado vs umbral normado). */
export function explain(features) {
  return features.map((f) => {
    const span = f.escala_max - f.base || 1;
    const pct = clamp((f.valor - f.base) / span, 0, 1);
    const thrPct = clamp((f.umbral - f.base) / span, 0, 1);
    const supera = f.operador === '<=' ? f.valor <= f.umbral : f.valor >= f.umbral;
    return {
      codigo: f.codigo,
      name: f.nombre,
      val: f.valor,
      thr: f.umbral,
      unidad: f.unidad,
      operador: f.operador,
      pct: Math.round(pct * 100),
      thrPct: Math.round(thrPct * 100),
      supera
    };
  });
}

function localScore(features) {
  let num = 0;
  let den = 0;
  for (const f of features) {
    const denom = f.escala_max - f.umbral || 1;
    const e = clamp((f.valor - f.umbral) / denom, -1.5, 1.5);
    num += f.peso * e;
    den += f.peso;
  }
  const s = den ? num / den : -1;
  return 1 / (1 + Math.exp(-K * s));
}

async function remoteScore(amenaza, features) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${env.aiServiceUrl.replace(/\/$/, '')}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amenaza, features: Object.fromEntries(features.map((f) => [f.codigo, f.valor])) }),
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error(`IA ${r.status}`);
    const j = await r.json();
    return Number(j.probabilidad ?? j.probability);
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} amenaza código de amenaza (INU, INC…)
 * @param {Array} features [{codigo,nombre,unidad,valor,umbral,operador,base,escala_max,peso}]
 */
export async function predict(amenaza, features) {
  if (!features.length) return null;
  let probabilidad;
  let motor = 'integrado';
  if (env.aiServiceUrl) {
    try {
      probabilidad = await remoteScore(amenaza, features);
      motor = 'microservicio';
    } catch (e) {
      console.warn('[IA] microservicio no disponible, se usa motor integrado:', e.message);
    }
  }
  if (!Number.isFinite(probabilidad)) probabilidad = localScore(features);
  probabilidad = Math.round(probabilidad * 1000) / 1000;
  const variables = explain(features);
  const nivel = nivelDesdeProbabilidad(probabilidad, variables.some((v) => v.supera));
  return { probabilidad, nivel, variables, motor };
}
