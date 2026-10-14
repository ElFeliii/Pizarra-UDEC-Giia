import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOD_PASSWORD, startServer } from './helpers';

let servidor: Awaited<ReturnType<typeof startServer>>;
let cookie: string;
let notaId: number;
beforeEach(async () => {
  servidor = await startServer();
  cookie = await servidor.modLogin();
  const usuario = await servidor.newUser();
  notaId = servidor.ctx.repos.pins.insert({
    seccion: 'pizarra',
    surface: 'board',
    x: 500,
    y: 500,
    color: 'verde',
    text: 'Nota ficticia para verificar el origen',
    userId: usuario.user.id,
    now: 1,
  });
});
afterEach(async () => {
  await servidor.close();
  vi.restoreAllMocks();
});

const rutaOcultar = () => `/api/admin/content/pin/${notaId}/hide`;
const cabecerasProxy = (origin: string) => ({
  host: 'pizarra.example.invalid',
  'x-forwarded-proto': 'https',
  origin,
  cookie,
});

describe('origen de las operaciones HTTP administrativas', () => {
  it.each([
    'https://otro.example.invalid',
    'null',
    'https://pizarra.example.invalid/',
    'https://pizarra.example.invalid:8443',
  ])('rechaza %s antes de ocultar incluso con cookie válida', async (origen) => {
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: rutaOcultar(),
      headers: { ...cabecerasProxy(origen), 'sec-fetch-site': 'same-site' },
    });
    expect(resultado.statusCode).toBe(403);
    expect(resultado.json().error.code).toBe('UNAUTHORIZED');
    expect(servidor.ctx.repos.pins.get(notaId)?.hiddenAt).toBeNull();
    expect(
      (await servidor.app.inject({ url: '/api/admin/me', headers: { cookie } })).statusCode,
    ).toBe(200);
  });

  it('el origen ajeno no puede cerrar la sesión válida', async () => {
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: cabecerasProxy('https://otro.example.invalid'),
    });
    expect(resultado.statusCode).toBe(403);
    expect(
      (await servidor.app.inject({ url: '/api/admin/me', headers: { cookie } })).statusCode,
    ).toBe(200);
  });

  it('rechaza el login ajeno antes de intentar autenticar o consumir su presupuesto', async () => {
    const intentos = vi.spyOn(servidor.ctx.limiters.modLogin, 'take');
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: cabecerasProxy('https://otro.example.invalid'),
      payload: { moderatorName: 'Mod Test', password: MOD_PASSWORD },
    });
    expect(resultado.statusCode).toBe(403);
    expect(resultado.headers['set-cookie']).toBeUndefined();
    expect(intentos).not.toHaveBeenCalled();
  });

  it('rechaza una petición ajena antes de interpretar un cuerpo JSON inválido', async () => {
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: {
        ...cabecerasProxy('https://otro.example.invalid'),
        'content-type': 'application/json',
      },
      payload: '{',
    });
    expect(resultado.statusCode).toBe(403);
  });

  it('también protege DELETE de palabras sin cambiar el filtro', async () => {
    const palabra = servidor.ctx.repos.bannedWords.list()[0]!;
    const resultado = await servidor.app.inject({
      method: 'DELETE',
      url: `/api/admin/words/${palabra.id}`,
      headers: cabecerasProxy('https://otro.example.invalid'),
    });
    expect(resultado.statusCode).toBe(403);
    expect(servidor.ctx.repos.bannedWords.get(palabra.id)).toBeDefined();
  });

  it.each(['same-site', 'cross-site'])(
    'sin Origin rechaza metadatos de navegador %s; no se interpreta como cliente CLI',
    async (sitio) => {
      const resultado = await servidor.app.inject({
        method: 'POST',
        url: rutaOcultar(),
        headers: { cookie, 'sec-fetch-site': sitio },
      });
      expect(resultado.statusCode).toBe(403);
      expect(servidor.ctx.repos.pins.get(notaId)?.hiddenAt).toBeNull();
    },
  );

  it('mantiene el mismo origen HTTPS detrás de un proxy confiable', async () => {
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: rutaOcultar(),
      headers: cabecerasProxy('https://pizarra.example.invalid'),
    });
    expect(resultado.statusCode).toBe(200);
    expect(resultado.json()).toEqual({ changed: true });
  });

  it('mantiene el mismo origen HTTP y la sesión sigue siendo obligatoria', async () => {
    const sinCookie = await servidor.app.inject({
      method: 'POST',
      url: rutaOcultar(),
      headers: { origin: servidor.url, host: new URL(servidor.url).host },
    });
    expect(sinCookie.statusCode).toBe(401);
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: rutaOcultar(),
      headers: { cookie, origin: servidor.url, host: new URL(servidor.url).host },
    });
    expect(resultado.statusCode).toBe(200);
  });

  it('permite operación CLI sin Origin manteniendo la autenticación', async () => {
    expect((await servidor.app.inject({ method: 'POST', url: rutaOcultar() })).statusCode).toBe(
      401,
    );
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: rutaOcultar(),
      headers: { cookie },
    });
    expect(resultado.statusCode).toBe(200);
    expect(resultado.json()).toEqual({ changed: true });
  });

  it('el proxy debe preservar el protocolo; no acepta un esquema distinto', async () => {
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: rutaOcultar(),
      headers: cabecerasProxy('http://pizarra.example.invalid'),
    });
    expect(resultado.statusCode).toBe(403);
  });

  it('no confía en X-Forwarded-Proto si el par no está autorizado', async () => {
    await servidor.close();
    servidor = await startServer({ TRUST_PROXY: 'false' });
    cookie = await servidor.modLogin();
    const resultado = await servidor.app.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: cabecerasProxy('https://pizarra.example.invalid'),
    });
    expect(resultado.statusCode).toBe(403);
    expect(
      (await servidor.app.inject({ url: '/api/admin/me', headers: { cookie } })).statusCode,
    ).toBe(200);
  });

  it.each(['development', 'production'])(
    'Vite en otro puerto sólo tiene excepción en desarrollo explícito: %s',
    async (entorno) => {
      await servidor.close();
      servidor = await startServer({ NODE_ENV: entorno });
      cookie = await servidor.modLogin();
      const resultado = await servidor.app.inject({
        method: 'POST',
        url: '/api/admin/logout',
        headers: { cookie, origin: 'http://127.0.0.1:5173', host: '127.0.0.1:3000' },
      });
      expect(resultado.statusCode).toBe(entorno === 'development' ? 200 : 403);
    },
  );
});
