import type { ClientToServerEvents, ServerToClientEvents } from '@pizarra/shared';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Conexión en tiempo real. Intenta WebSocket primero (menos carga para el servidor con mucho
 * tráfico) y cae a long-polling si la red lo bloquea.
 */
export function createSocket(token?: string): AppSocket {
  return io({
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.5,
    timeout: 10000,
  });
}
