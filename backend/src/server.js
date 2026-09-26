import http from 'node:http';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './socket.js';
import { startScheduler } from './services/scheduler.js';

const app = createApp();
const server = http.createServer(app);
initSocket(server);

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log(`[db] conectado a ${env.db.host}:${env.db.port}/${env.db.database}`);
  } catch (e) {
    console.error('[db] no se pudo conectar a MySQL:', e.message);
    console.error('      Revise backend/.env y ejecute "npm run db:reset" para crear la base de datos.');
    process.exit(1);
  }
  server.listen(env.port, () => {
    console.log(`[api] SADE-IA escuchando en http://localhost:${env.port}/api`);
  });
  startScheduler();
}

const shutdown = async () => {
  console.log('\n[api] cerrando…');
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
