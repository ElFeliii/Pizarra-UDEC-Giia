import type { ClientToServerEvents, ServerToClientEvents } from '@pizarra/shared';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { io as ioc, type Socket } from 'socket.io-client';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const MOD_PASSWORD = 'clave-de-prueba-123';

export async function startServer(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DB_PATH: ':memory:',
    MOD_PASSWORD,
    SESSION_SECRET: 's'.repeat(40),
    AUTO_HIDE_REPORTS: '3',
    CLIENT_DIST: '/no-existe',
    // Lista propia: las pruebas no dependen de los colegios reales, que cambian.
    INSTITUTIONS_PATH: fileURLToPath(new URL('fixtures/instituciones.json', import.meta.url)),
    ...env,
  });
  const built = await buildApp(config);
  await built.app.listen({ host: '127.0.0.1', port: 0 });
  const port = (built.app.server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const sockets: TestSocket[] = [];

  let n = 0;
  async function newUser(name = `Usuario ${++n}`, institutionId = 'colegio-ejemplo-1') {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { name, institutionId },
    });
    if (res.statusCode !== 201) throw new Error(`session failed: ${res.body}`);
    return res.json() as { token: string; user: { id: number; name: string } };
  }

  async function connect(token?: string, cookie?: string): Promise<TestSocket> {
    const socket: TestSocket = ioc(url, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      extraHeaders: cookie ? { cookie } : undefined,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function modLogin(): Promise<string> {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: MOD_PASSWORD, moderatorName: 'Mod Test' },
    });
    if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
    return raw.split(';')[0]!;
  }

  async function close() {
    for (const s of sockets) s.disconnect();
    await built.app.close();
  }

  return { ...built, url, newUser, connect, modLogin, close };
}

export function once<E extends keyof ServerToClientEvents>(
  socket: TestSocket,
  event: E,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), timeoutMs);
    // @ts-expect-error: el tipado genérico de socket.io-client no acepta E como clave directa
    socket.once(event, (...args: Parameters<ServerToClientEvents[E]>) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

export const pinInput = (text: string, x = 100, y = 100) => ({
  surface: 'board' as const,
  x,
  y,
  color: 'azul' as const,
  text,
});
