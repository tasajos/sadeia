/**
 * Crea la base de datos sadeia_db ejecutando database/schema.sql.
 * Uso: npm run db:init   (requiere un usuario MySQL con permiso CREATE)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Divide el script respetando DELIMITER (necesario para los triggers). */
function splitSql(sql) {
  const out = [];
  let delim = ';';
  let buf = '';
  for (const line of sql.split(/\r?\n/)) {
    const m = line.match(/^\s*DELIMITER\s+(\S+)/i);
    if (m) { delim = m[1]; continue; }
    if (/^\s*--/.test(line) && !buf.trim()) continue;
    buf += line + '\n';
    if (buf.trimEnd().endsWith(delim)) {
      const stmt = buf.trimEnd().slice(0, -delim.length).trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8')
  .replaceAll('sadeia_db', env.db.database);

const conn = await mysql.createConnection({ host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, multipleStatements: false });
const stmts = splitSql(sql);
for (const s of stmts) {
  try {
    await conn.query(s);
  } catch (e) {
    console.error('\n[initDb] Error en la sentencia:\n', s.slice(0, 300), '\n→', e.message);
    process.exit(1);
  }
}
await conn.end();
console.log(`[initDb] Esquema ${env.db.database} creado (${stmts.length} sentencias).`);
