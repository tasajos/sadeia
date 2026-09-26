/** Utilidades de formato en convención boliviana (coma decimal, dd/mm/aaaa). */
export const dec = (n, d = 2) =>
  n === null || n === undefined ? '—' : Number(n).toFixed(d).replace('.', ',');

export const pad2 = (n) => String(n).padStart(2, '0');

export const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}/${x.getFullYear()}`;
};

export const fmtTime = (d, sec = false) => {
  if (!d) return '';
  const x = new Date(d);
  return `${pad2(x.getHours())}:${pad2(x.getMinutes())}${sec ? ':' + pad2(x.getSeconds()) : ''}`;
};

export const fmtShort = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)} ${fmtTime(x)}`;
};

export const thousands = (n) => Number(n).toLocaleString('es-BO').replace(/,/g, '.');

export const parseJson = (v, def = null) => {
  if (v === null || v === undefined) return def;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return def; }
};
