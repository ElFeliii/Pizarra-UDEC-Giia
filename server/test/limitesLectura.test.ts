import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMIT_SPECS, RateLimiter } from '../src/moderation/rateLimit';
import { startServer } from './helpers';
import { io } from 'socket.io-client';

type Servidor = Awaited<ReturnType<typeof startServer>>;
let servidor: Servidor;
let ahora: number;
let notaId: number;
let token: string;
const ip = '192.0.2.20';

beforeEach(async () => {
  ahora = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => ahora);
  servidor = await startServer({ TRUST_PROXY: 'false' });
  const usuario = await servidor.newUser();
  token = usuario.token;
  notaId = servidor.ctx.repos.pins.insert({
    seccion: 'pizarra',
    surface: 'board',
    x: 100,
    y: 100,
    color: 'verde',
    text: 'Una nota pública de prueba',
    userId: usuario.user.id,
    now: ahora,
  });
});

afterEach(async () => {
  await servidor.close();
  vi.restoreAllMocks();
});

function agotar(direccion = ip) {
  const limite = (
    servidor.ctx.limiters as typeof servidor.ctx.limiters & { lecturasHttp?: RateLimiter }
  ).lecturasHttp;
  if (limite)
    while (limite.take(direccion).ok) {
      /* Sólo consume tokens; no consulta SQLite. */
    }
}

describe('presupuesto temprano para lecturas públicas HTTP', () => {
  it.each(['notas', 'hilo', 'búsqueda', 'sesión'])(
    'frena %s antes de consultar SQLite',
    async (tipo) => {
      agotar();
      const consultas = [
        vi.spyOn(servidor.ctx.repos.pins, 'listVisible'),
        vi.spyOn(servidor.ctx.repos.pins, 'get'),
        vi.spyOn(servidor.ctx.repos.search, 'search'),
        vi.spyOn(servidor.ctx.repos.users, 'findByTokenHash'),
      ];
      const ruta = {
        notas: '/api/pins?seccion=pizarra',
        hilo: `/api/pins/${notaId}/thread`,
        búsqueda: '/api/search?q=pública&seccion=pizarra',
        sesión: '/api/session',
      }[tipo]!;
      const salida = await servidor.app.inject({
        url: ruta,
        remoteAddress: ip,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(salida.statusCode).toBe(429);
      expect(salida.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
      expect(salida.headers['retry-after']).toBe('1');
      for (const consulta of consultas) expect(consulta).not.toHaveBeenCalled();
    },
  );

  it('no pierde disponibilidad de salud, catálogo ni WebSocket al agotar las lecturas', async () => {
    agotar();
    agotar('127.0.0.1');
    expect((await servidor.app.inject({ url: '/api/health', remoteAddress: ip })).statusCode).toBe(
      200,
    );
    expect(
      (await servidor.app.inject({ url: '/api/institutions', remoteAddress: ip })).statusCode,
    ).toBe(200);
    const socket = await servidor.connect();
    expect(socket.connected).toBe(true);
    const sondeo = io(servidor.url, {
      transports: ['polling'],
      forceNew: true,
      reconnection: false,
      timeout: 1000,
    });
    try {
      await new Promise<void>((resolver, rechazar) => {
        sondeo.once('connect', () => resolver());
        sondeo.once('connect_error', rechazar);
      });
      expect(sondeo.connected).toBe(true);
      expect(sondeo.io.engine.transport.name).toBe('polling');
    } finally {
      if (sondeo.connected) {
        const desconectado = new Promise<void>((resolver) =>
          sondeo.once('disconnect', () => resolver()),
        );
        servidor.io.sockets.sockets.get(sondeo.id!)?.disconnect(true);
        await desconectado;
      }
      sondeo.disconnect();
    }
    const salud = await fetch(`${servidor.url}/api/health`);
    expect(salud.status).toBe(200);
  });

  it('recupera presupuesto y separa clientes con IP diferente', async () => {
    agotar();
    expect((await servidor.app.inject({ url: '/api/pins', remoteAddress: ip })).statusCode).toBe(
      429,
    );
    expect(
      (await servidor.app.inject({ url: '/api/pins', remoteAddress: '192.0.2.21' })).statusCode,
    ).toBe(200);
    ahora += 10;
    expect((await servidor.app.inject({ url: '/api/pins', remoteAddress: ip })).statusCode).toBe(
      200,
    );
    expect((await servidor.app.inject({ url: '/api/pins', remoteAddress: ip })).statusCode).toBe(
      429,
    );
  });

  it('cuenta las solicitudes inválidas antes de validar sus parámetros', async () => {
    const limite = (
      servidor.ctx.limiters as typeof servidor.ctx.limiters & { lecturasHttp?: RateLimiter }
    ).lecturasHttp;
    if (limite) {
      for (let n = 0; n < 2399; n++) expect(limite.take(ip).ok).toBe(true);
    }
    expect(
      (await servidor.app.inject({ url: '/api/pins?surface=incorrecta', remoteAddress: ip }))
        .statusCode,
    ).toBe(400);
    expect(
      (await servidor.app.inject({ url: '/api/search?q=nota', remoteAddress: ip })).statusCode,
    ).toBe(429);
  });

  it('admite lecturas normales de asistentes que comparten la IP del WiFi', async () => {
    for (let lector = 0; lector < 20; lector++) {
      for (const url of [
        '/api/pins?seccion=pizarra',
        `/api/pins/${notaId}/thread`,
        '/api/search?q=nota',
        '/api/session',
      ]) {
        const respuesta = await servidor.app.inject({
          url,
          remoteAddress: ip,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(respuesta.statusCode).toBe(200);
      }
    }
    // Comprueba los 600 lectores × 4 lecturas sólo con tokens, sin 2400 consultas adicionales.
    const especificacion = (
      LIMIT_SPECS as typeof LIMIT_SPECS & { lecturasHttp?: { capacity: number; refillMs: number } }
    ).lecturasHttp;
    expect(especificacion).toBeDefined();
    const compartido = new RateLimiter(especificacion!, () => 0);
    for (let n = 0; n < 600 * 4; n++) expect(compartido.take(ip).ok).toBe(true);
  });
});
