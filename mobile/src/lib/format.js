const p2 = (n) => String(n).padStart(2, '0');
export const dec = (n, d = 2) => (n === null || n === undefined ? '—' : Number(n).toFixed(d).replace('.', ','));
export const fTime = (d) => { if (!d) return ''; const x = new Date(d); return `${p2(x.getHours())}:${p2(x.getMinutes())}`; };
export const fShort = (d) => { if (!d) return ''; const x = new Date(d); return `${p2(x.getDate())}/${p2(x.getMonth() + 1)} ${fTime(x)}`; };
