import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { one } from './config/db.js';

let io = null;

/**
 * Canal en tiempo real (tablero sin recarga, notificación simultánea RF-06).
 * Salas:
 *   user:<id> · inst:<id> · equipo:<id> · perm:<codigo> · reporte:<codigo> (seguimiento ciudadano)
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // cliente público (app ciudadana)
    try {
      const p = jwt.verify(token, env.jwtSecret);
      socket.data.userId = p.sub;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket) => {
    if (socket.data.userId) {
      const { loadProfile } = await import('./middleware/auth.js');
      const u = await loadProfile(socket.data.userId);
      if (u && u.estado === 'Activo') {
        socket.join(`user:${u.id}`);
        socket.join(`inst:${u.institucion_id}`);
        socket.join('staff');
        if (u.equipo_id) socket.join(`equipo:${u.equipo_id}`);
        u.permisos.forEach((p) => socket.join(`perm:${p}`));
      }
    }
    // Seguimiento de un reporte ciudadano: requiere código + token de seguimiento
    socket.on('seguir-reporte', async ({ codigo, token } = {}, ack) => {
      const r = await one('SELECT id FROM reporte_ciudadano WHERE codigo = ? AND token_seguimiento = ?', [codigo, token]);
      if (r) socket.join(`reporte:${codigo}`);
      if (typeof ack === 'function') ack({ ok: !!r });
    });
  });
  return io;
}

/** Emite a una sala (o a todo el personal si no se indica). */
export function emit(event, payload, room = 'staff') {
  if (!io) return;
  (Array.isArray(room) ? room : [room]).forEach((r) => io.to(r).emit(event, payload));
}

/** Emite a todos, incluidos clientes públicos (p. ej., alerta validada para la app ciudadana). */
export function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}
