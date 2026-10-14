import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, pinInput } from './helpers';
import { createPin } from '../src/services/content';
import { hideContent } from '../src/services/moderation';

describe('respuestas dinámicas sin caché compartida', () => {
  let servidor: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    servidor = await startServer();
  });
  afterEach(async () => {
    await servidor.close();
  });

  it('protege todas las lecturas administrativas, incluidas las denegadas y CSV', async () => {
    const cookie = await servidor.modLogin();
    const usuario = await servidor.newUser('Persona de prueba');
    const nota = createPin(
      servidor.ctx,
      usuario.user.id,
      pinInput('Contenido reservado de revisión'),
      '127.0.0.1',
    );
    expect(nota.ok).toBe(true);
    if (!nota.ok) throw new Error('No se creó la nota de prueba');
    hideContent(servidor.ctx, 'pin', nota.data.id, 'Mod Test', 'mod');
    for (const ruta of [
      '/api/admin/me',
      '/api/admin/feed',
      '/api/admin/reports',
      '/api/admin/users',
      '/api/admin/stats',
      '/api/admin/secciones',
      '/api/admin/temas',
      '/api/admin/words',
      '/api/admin/export/pins.csv',
    ]) {
      const denegada = await servidor.app.inject(ruta);
      expect(denegada.statusCode, ruta).toBe(401);
      expect(denegada.headers['cache-control'], ruta).toBe('no-store');
      const permitida = await servidor.app.inject({ url: ruta, headers: { cookie } });
      expect(permitida.statusCode, ruta).toBe(200);
      expect(permitida.headers['cache-control'], ruta).toBe('no-store');
      if (ruta === '/api/admin/feed')
        expect(permitida.body).toContain('Contenido reservado de revisión');
    }
    const invalida = await servidor.app.inject({
      url: '/api/admin/feed?limit=incorrecto',
      headers: { cookie },
    });
    expect(invalida.statusCode).toBe(400);
    expect(invalida.headers['cache-control']).toBe('no-store');
  });

  it('impide almacenar la sesión de asistente y el login o logout de moderación', async () => {
    const sesion = await servidor.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { name: 'Persona de prueba', institutionId: 'colegio-ejemplo-1' },
    });
    expect(sesion.statusCode).toBe(201);
    expect(sesion.headers['cache-control']).toBe('no-store');
    const vigente = await servidor.app.inject({
      url: '/api/session',
      headers: { authorization: `Bearer ${sesion.json().token}` },
    });
    expect(vigente.statusCode).toBe(200);
    expect(vigente.headers['cache-control']).toBe('no-store');
    const fallido = await servidor.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { moderatorName: 'Mod Test', password: 'incorrecta' },
    });
    expect(fallido.statusCode).toBe(401);
    expect(fallido.headers['cache-control']).toBe('no-store');
    const cookie = await servidor.modLogin();
    const logout = await servidor.app.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.headers['cache-control']).toBe('no-store');
  });

  it('los hilos y las búsquedas cambian al ocultar contenido sin conservar la respuesta previa', async () => {
    const usuario = await servidor.newUser('Persona de prueba');
    const nota = createPin(
      servidor.ctx,
      usuario.user.id,
      pinInput('Observatorio galáctico'),
      '127.0.0.1',
    );
    if (!nota.ok) throw new Error('No se creó la nota de prueba');
    const ruta = `/api/pins/${nota.data.id}/thread`;
    const antes = await servidor.app.inject(ruta);
    expect(antes.statusCode).toBe(200);
    expect(antes.headers['cache-control']).toBe('no-store');
    const busqueda = await servidor.app.inject('/api/search?q=galáctico');
    expect(busqueda.json()).toHaveLength(1);
    expect(busqueda.headers['cache-control']).toBe('no-store');
    hideContent(servidor.ctx, 'pin', nota.data.id, 'Mod Test', 'mod');
    const despues = await servidor.app.inject(ruta);
    expect(despues.statusCode).toBe(404);
    expect(despues.headers['cache-control']).toBe('no-store');
    expect((await servidor.app.inject('/api/search?q=galáctico')).json()).toEqual([]);
    for (const rutaPublica of ['/api/secciones', '/api/temas', '/api/words/top']) {
      expect((await servidor.app.inject(rutaPublica)).headers['cache-control'], rutaPublica).toBe(
        'no-store',
      );
    }
  });
});

describe('presupuesto temprano del catálogo de temas', () => {
  it('rechaza la lectura agotada antes del listado SQL y recupera el acceso sin perder visibilidad', async () => {
    const reloj = vi.spyOn(Date, 'now');
    let ahora = Date.now();
    reloj.mockImplementation(() => ahora);
    const servidor = await startServer();
    try {
      const ip = '192.0.2.75';
      while (servidor.ctx.limiters.lecturasHttp.take(ip).ok) {
        /* Agota tokens sin consultar la base. */
      }
      const listado = vi.spyOn(servidor.ctx.repos.temas, 'listarVisibles');
      const rechazada = await servidor.app.inject({ url: '/api/temas', remoteAddress: ip });
      expect(rechazada.statusCode).toBe(429);
      expect(rechazada.headers['retry-after']).toBe('1');
      expect(listado).not.toHaveBeenCalled();
      ahora += 10;
      const recuperada = await servidor.app.inject({ url: '/api/temas', remoteAddress: ip });
      expect(recuperada.statusCode).toBe(200);
      expect(recuperada.json()).toHaveLength(92);
      expect(listado).toHaveBeenCalledTimes(1);
      expect((await servidor.app.inject({ url: '/api/temas', remoteAddress: ip })).statusCode).toBe(
        429,
      );
      expect(
        (await servidor.app.inject({ url: '/api/health', remoteAddress: ip })).statusCode,
      ).toBe(200);
    } finally {
      await servidor.close();
      vi.restoreAllMocks();
    }
  });
});

describe('presupuesto del ranking con revisión persistente', () => {
  it('rechaza antes de leer la revisión o ranking y recupera el acceso', async () => {
    const reloj = vi.spyOn(Date, 'now');
    let ahora = Date.now();
    reloj.mockImplementation(() => ahora);
    const servidor = await startServer();
    try {
      const ip = '192.0.2.76';
      servidor.ctx.topWords.top();
      while (servidor.ctx.limiters.lecturasHttp.take(ip).ok) {
        /* No consulta la base. */
      }
      const revision = vi.spyOn(servidor.ctx.repos.wordCounts, 'revision');
      const ranking = vi.spyOn(servidor.ctx.repos.wordCounts, 'top');
      const rechazada = await servidor.app.inject({ url: '/api/words/top', remoteAddress: ip });
      expect(rechazada.statusCode).toBe(429);
      expect(rechazada.headers['retry-after']).toBe('1');
      expect(revision).not.toHaveBeenCalled();
      expect(ranking).not.toHaveBeenCalled();
      ahora += 10;
      const permitida = await servidor.app.inject({ url: '/api/words/top', remoteAddress: ip });
      expect(permitida.statusCode).toBe(200);
      expect(permitida.json()).toEqual([]);
      expect(revision).toHaveBeenCalledTimes(1);
      expect(ranking).not.toHaveBeenCalled();
    } finally {
      await servidor.close();
      vi.restoreAllMocks();
    }
  });
});

describe('selector de exportaciones administrativas', () => {
  it('rechaza propiedades heredadas y conserva las exportaciones válidas', async () => {
    const servidor = await startServer();
    try {
      const cookie = await servidor.modLogin();
      for (const nombre of [
        '__proto__',
        'constructor',
        'toString',
        'hasOwnProperty',
        'no-existe',
      ]) {
        for (const sufijo of ['', '.csv']) {
          const respuesta = await servidor.app.inject({
            url: `/api/admin/export/${nombre}${sufijo}`,
            headers: { cookie },
          });
          expect(respuesta.statusCode, `${nombre}${sufijo}`).toBe(404);
          expect(respuesta.json().error.code).toBe('NOT_FOUND');
        }
      }
      for (const nombre of ['pins', 'replies', 'users']) {
        expect(
          (
            await servidor.app.inject({
              url: `/api/admin/export/${nombre}.csv`,
              headers: { cookie },
            })
          ).statusCode,
        ).toBe(200);
      }
      expect((await servidor.app.inject('/api/health')).statusCode).toBe(200);
    } finally {
      await servidor.close();
    }
  });
});
