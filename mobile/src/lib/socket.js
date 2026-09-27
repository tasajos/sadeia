import { io } from 'socket.io-client';
import { BASE_URL, getToken } from './api';

let socket = null;

/** Conexión en tiempo real (token opcional: la app ciudadana se conecta sin sesión). */
export async function connectSocket(withAuth = true) {
  if (socket) socket.disconnect();
  const token = withAuth ? await getToken() : null;
  socket = io(BASE_URL, { transports: ['websocket'], auth: token ? { token } : {}, reconnectionDelay: 3000 });
  return socket;
}

export const getSocket = () => socket;

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
