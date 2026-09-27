/**
 * Sonidos de alarma generados con Web Audio (sin archivos de audio).
 * Los navegadores solo permiten audio después de una interacción del usuario:
 * `unlockAudio` se engancha al primer clic/tecla de la sesión.
 */
let ctx = null;

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  ensureAudio(); // válido si la pestaña ya tuvo interacción (p. ej., el clic de inicio de sesión)
  const off = () => { window.removeEventListener('pointerdown', h); window.removeEventListener('keydown', h); };
  const h = () => { ensureAudio(); off(); };
  window.addEventListener('pointerdown', h);
  window.addEventListener('keydown', h);
  return off;
}

export const audioBlocked = () => !ctx || ctx.state !== 'running';

/** Tono con envolvente corta para evitar clics. */
function tone(ac, { freq, to, start, dur, type = 'square', vol = 0.18 }) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (to) o.frequency.linearRampToValueAtTime(to, start + dur);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.02);
  g.gain.setValueAtTime(vol, start + dur - 0.04);
  g.gain.linearRampToValueAtTime(0, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/**
 * Patrones (≈2 s por ciclo):
 *  - critica: sirena ascendente/descendente (alerta roja/naranja, emergencia crítica)
 *  - alerta:  dos tonos alternados hi-lo
 *  - despacho: ráfaga de pitidos de radio para equipos de primera respuesta
 */
const PATRONES = {
  critica: (ac, t) => {
    for (let i = 0; i < 2; i++) {
      tone(ac, { freq: 650, to: 1300, start: t + i * 1, dur: 0.5, type: 'sawtooth', vol: 0.14 });
      tone(ac, { freq: 1300, to: 650, start: t + i * 1 + 0.5, dur: 0.5, type: 'sawtooth', vol: 0.14 });
    }
  },
  alerta: (ac, t) => {
    for (let i = 0; i < 4; i++) tone(ac, { freq: i % 2 ? 740 : 988, start: t + i * 0.42, dur: 0.38 });
  },
  despacho: (ac, t) => {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 3; i++) tone(ac, { freq: 1175, start: t + r * 0.9 + i * 0.16, dur: 0.11, vol: 0.2 });
      tone(ac, { freq: 1568, start: t + r * 0.9 + 0.5, dur: 0.26, vol: 0.2 });
    }
  }
};

/** Repite el patrón hasta llamar a la función devuelta (o hasta `maxMs`). */
export function startAlarm(tipo = 'alerta', { every = 2400, maxMs = 60000 } = {}) {
  const play = () => {
    const ac = ensureAudio();
    if (ac && ac.state === 'running') (PATRONES[tipo] || PATRONES.alerta)(ac, ac.currentTime + 0.05);
  };
  play();
  const iv = setInterval(play, every);
  const to = setTimeout(() => clearInterval(iv), maxMs);
  return () => { clearInterval(iv); clearTimeout(to); };
}
