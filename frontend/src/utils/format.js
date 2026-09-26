/** Formatos en convención boliviana. */
export const dec = (n, d = 2) => (n === null || n === undefined || n === '' ? '—' : Number(n).toFixed(d).replace('.', ','));
export const num = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-BO'));
const p2 = (n) => String(n).padStart(2, '0');
export const fDate = (d) => { if (!d) return '—'; const x = new Date(d); return `${p2(x.getDate())}/${p2(x.getMonth() + 1)}/${x.getFullYear()}`; };
export const fTime = (d, s = false) => { if (!d) return '—'; const x = new Date(d); return `${p2(x.getHours())}:${p2(x.getMinutes())}${s ? ':' + p2(x.getSeconds()) : ''}`; };
export const fShort = (d) => { if (!d) return '—'; const x = new Date(d); return `${p2(x.getDate())}/${p2(x.getMonth() + 1)} ${fTime(x)}`; };
export const fDateTime = (d) => (d ? `${fDate(d)} ${fTime(d)}` : '—');

export function ago(d) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `hace ${Math.max(s, 0)} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h ${m % 60 ? p2(m % 60) + ' min' : ''}`.trim();
  const dd = new Date(d);
  const today = new Date();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (dd.toDateString() === yest.toDateString()) return `ayer ${fTime(d)}`;
  return fDate(d);
}

/** Último acceso relativo: "hoy 14:02", "ayer 19:20" o fecha. */
export function lastAccess(d) {
  if (!d) return 'nunca';
  const x = new Date(d);
  const t = new Date();
  if (x.toDateString() === t.toDateString()) return `hoy ${fTime(x)}`;
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (x.toDateString() === y.toDateString()) return `ayer ${fTime(x)}`;
  return fDate(x);
}

export const initials = (name = '') =>
  name.replace(/^(Cnl\.|My\.|Tte\.\s?Cnl\.|Lic\.|Ing\.|Sgto\.|Gral\.|Dr\.|Arq\.)\s*/i, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Valor con unidad en explicaciones (8,92 m · −9 °C · 1.850 J/kg). */
export function valUnit(v, unidad) {
  const n = Number(v);
  const txt = Number.isInteger(n) ? (Math.abs(n) >= 1000 ? n.toLocaleString('es-BO') : String(n)) : dec(n, 2);
  return `${txt.replace('-', '−')}${unidad ? ' ' + unidad : ''}`;
}
