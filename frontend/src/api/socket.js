import { io } from 'socket.io-client';
import { getToken } from './client';

let socket = null;

/** Conexión en tiempo real autenticada con el JWT (salas por institución, permisos y equipo). */
export function connectSocket() {
  if (socket) socket.disconnect();
  socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
