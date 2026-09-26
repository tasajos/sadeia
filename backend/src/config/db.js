import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 15,
  charset: 'utf8mb4',
  timezone: 'local',
  dateStrings: false,
  decimalNumbers: true
});

/**
 * Alinea la zona horaria de la sesión MySQL con la del proceso Node (p. ej. TZ=America/La_Paz),
 * para que NOW() y las fechas enviadas desde la aplicación sean coherentes.
 */
const tzOffset = () => {
  const m = -new Date().getTimezoneOffset();
  const s = m >= 0 ? '+' : '-';
  const a = Math.abs(m);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};
pool.pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${tzOffset()}'`);
});

/** Ejecuta una consulta y devuelve las filas. */
export async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Devuelve la primera fila o null. */
export async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

/** Ejecuta fn dentro de una transacción (ACID para evidencia administrativa). */
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Genera el siguiente correlativo legible: PREFIJO-AAAA-NNNN */
export async function nextCode(prefijo, pad = 4, conn = null) {
  const gestion = prefijo === 'T' ? 0 : new Date().getFullYear();
  const c = conn ?? (await pool.getConnection());
  try {
    // LAST_INSERT_ID(expr) es por conexión: seguro ante concurrencia.
    await c.query(
      'INSERT INTO secuencia (prefijo, gestion, ultimo) VALUES (?, ?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE ultimo = LAST_INSERT_ID(ultimo + 1)',
      [prefijo, gestion]
    );
    const [[row]] = await c.query('SELECT LAST_INSERT_ID() AS n');
    const n = String(row.n).padStart(pad, '0');
    return prefijo === 'T' ? `T-${n}` : `${prefijo}-${gestion}-${n}`;
  } finally {
    if (!conn) c.release();
  }
}
