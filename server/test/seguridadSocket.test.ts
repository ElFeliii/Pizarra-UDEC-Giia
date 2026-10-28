import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as conectar, type Socket } from 'socket.io-client';
import { MOD_SESSION_TTL_MS } from '../src/http/auth';
import { createNota, createPin, createReply } from '../src/services/content';
import { hideContent, restoreContent } from '../src/services/moderation';
import { once, pinInput, startServer } from './helpers';

type Servidor = Awaited<ReturnType<typeof startServer>>;
let servidor: Servidor;
let ahora: number;
const conexiones: Socket[] = [];

beforeEach(async () => {
  ahora = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => ahora);
  servidor = await startServer();
});

afterEach(async () => {
  for (const conexion of conexiones.splice(0)) conexion.disconnect();
  await servidor.close();
  vi.restoreAllMocks();
});

const pausa = () => new Promise<void>((resolver) => setTimeout(resolver, 60));

async function abrirConexion(cabeceras: Record<string, string> = {}) {
  const conexion = conectar(servidor.url, {
    transports: ['websocket'],
    extraHeaders: cabeceras,
    reconnection: false,
    timeout: 1000,
    forceNew: true,
  });
  conexiones.push(conexion);
  return new Promise<boolean>((resolver) => {
    conexion.once('connect', () => resolver(true));
    conexion.once('connect_error', () => resolver(false));
  });
}

describe('vigencia de moderación en WebSocket', () => {
  it.each(['cerrada', 'caducada'])(
    'retira todos los eventos privados de una sesión %s inmediatamente',
    async (estado) => {
      const usuario = await servidor.newUser();
      const pin = await createPin(
        servidor.ctx,
        usuario.user.id,
        pinInput('Mensaje para revisar'),
        'ip-prueba',
      );
      if (!pin.ok) throw new Error(pin.error.message);
      const cookie = await servidor.modLogin();
      const anterior = await servidor.connect(undefined, cookie);
      const recibidos: string[] = [];
      anterior.on('mod:feed', () => recibidos.push('feed'));
      anterior.on('mod:report', () => recibidos.push('reporte'));
      anterior.on('mod:changed', () => recibidos.push('cambio'));
      if (estado === 'cerrada') {
        await servidor.app.inject({
          method: 'POST',
          url: '/api/admin/logout',
          headers: { cookie },
        });
      } else {
        ahora += MOD_SESSION_TTL_MS + 1;
      }
      expect(
        (await servidor.app.inject({ url: '/api/admin/me', headers: { cookie } })).statusCode,
      ).toBe(401);
      const vigente = await servidor.connect(undefined, await servidor.modLogin());
      const feed = once(vigente, 'mod:feed');
      const reporte = once(vigente, 'mod:report');
      const cambio = once(vigente, 'mod:changed');
      servidor.ctx.broadcaster.modFeed(servidor.ctx.repos.mod.item('pin', pin.data.id)!);
      servidor.ctx.broadcaster.modReport('pin', pin.data.id, true);
      servidor.ctx.broadcaster.modChanged('pin', pin.data.id, ahora, 'mod');
      await Promise.all([feed, reporte, cambio]);
      await pausa();
      expect(recibidos).toEqual([]);
      expect(anterior.connected).toBe(true);
      expect(servidor.io.sockets.sockets.get(anterior.id!)?.rooms.has('mods')).toBe(false);
      const publico = once(anterior, 'pin:restored');
      hideContent(servidor.ctx, 'pin', pin.data.id, 'Prueba', 'mod');
      restoreContent(servidor.ctx, 'pin', pin.data.id, 'Prueba');
      expect((await publico)[0].id).toBe(pin.data.id);
    },
  );
});

describe('visibilidad de hilos y restauraciones', () => {
  it.each(['nota', 'seccion', 'tema'])(
    'una %s oculta impide nuevas suscripciones y restauraciones públicas',
    async (oculto) => {
      const usuario = await servidor.newUser();
      servidor.ctx.db.exec("UPDATE secciones SET estado = 'abierta' WHERE id = 'faq'");
      servidor.ctx.db.exec(
        "INSERT INTO temas VALUES ('faq-seguridad', 'faq', 'Pregunta de prueba', NULL, NULL, 1, 0)",
      );
      const pin = await createNota(
        servidor.ctx,
        usuario.user.id,
        {
          seccion: 'faq',
          temaId: 'faq-seguridad',
          color: 'verde',
          text: 'Nota privada durante revisión',
        },
        'ip-prueba',
      );
      if (!pin.ok) throw new Error(pin.error.message);
      const respuesta = await createReply(
        servidor.ctx,
        usuario.user.id,
        { pinId: pin.data.id, text: 'Respuesta privada durante revisión' },
        'ip-prueba',
      );
      if (!respuesta.ok) throw new Error(respuesta.error.message);
      const previo = await servidor.connect();
      previo.emit('thread:join', { pinId: pin.data.id });
      await previo.emitWithAck('pin:create', pinInput('Barrera de mensajes'));
      expect(servidor.io.sockets.sockets.get(previo.id!)?.rooms.has(`pin:${pin.data.id}`)).toBe(
        true,
      );
      hideContent(servidor.ctx, 'reply', respuesta.data.id, 'Prueba', 'mod');
      if (oculto === 'nota') hideContent(servidor.ctx, 'pin', pin.data.id, 'Prueba', 'mod');
      if (oculto === 'seccion')
        servidor.ctx.db.exec("UPDATE secciones SET estado = 'oculta' WHERE id = 'faq'");
      if (oculto === 'tema')
        servidor.ctx.db.exec("UPDATE temas SET oculto = 1 WHERE id = 'faq-seguridad'");
      expect((await servidor.app.inject(`/api/pins/${pin.data.id}/thread`)).statusCode).toBe(404);
      const lector = await servidor.connect();
      lector.emit('thread:join', { pinId: pin.data.id });
      await lector.emitWithAck('pin:create', pinInput('Barrera de mensajes'));
      expect
        .soft(servidor.io.sockets.sockets.get(lector.id!)?.rooms.has(`pin:${pin.data.id}`))
        .toBe(false);
      const restaurados: unknown[] = [];
      for (const conexion of [previo, lector]) {
        conexion.on('reply:restored', (mensaje) => restaurados.push(mensaje));
        conexion.on('pin:restored', (mensaje) => restaurados.push(mensaje));
      }
      expect(restoreContent(servidor.ctx, 'reply', respuesta.data.id, 'Prueba')).toBe(true);
      if (oculto !== 'nota') {
        hideContent(servidor.ctx, 'pin', pin.data.id, 'Prueba', 'mod');
        expect(restoreContent(servidor.ctx, 'pin', pin.data.id, 'Prueba')).toBe(true);
      }
      await pausa();
      expect(restaurados).toEqual([]);
      expect((await servidor.app.inject(`/api/pins/${pin.data.id}/thread`)).statusCode).toBe(404);
    },
  );

  it('no permite suscribirse a un hilo inexistente', async () => {
    const lector = await servidor.connect();
    lector.emit('thread:join', { pinId: 987654321 });
    await lector.emitWithAck('pin:create', pinInput('Barrera de mensajes'));
    expect(servidor.io.sockets.sockets.get(lector.id!)?.rooms.has('pin:987654321')).toBe(false);
  });

  it('las restauraciones visibles siguen llegando a asistentes sin sesión', async () => {
    const usuario = await servidor.newUser();
    const pin = await createPin(
      servidor.ctx,
      usuario.user.id,
      pinInput('Nota pública'),
      'ip-prueba',
    );
    if (!pin.ok) throw new Error(pin.error.message);
    const respuesta = await createReply(
      servidor.ctx,
      usuario.user.id,
      { pinId: pin.data.id, text: 'Respuesta pública' },
      'ip-prueba',
    );
    if (!respuesta.ok) throw new Error(respuesta.error.message);
    const lector = await servidor.connect();
    lector.emit('thread:join', { pinId: pin.data.id });
    await lector.emitWithAck('pin:create', pinInput('Barrera de mensajes'));
    hideContent(servidor.ctx, 'reply', respuesta.data.id, 'Prueba', 'mod');
    const evento = once(lector, 'reply:restored');
    expect(restoreContent(servidor.ctx, 'reply', respuesta.data.id, 'Prueba')).toBe(true);
    expect((await evento)[0].text).toBe('Respuesta pública');
  });
});

describe('origen del navegador en WebSocket', () => {
  it('mantiene los clientes CLI sin Origin', async () => {
    expect(await abrirConexion()).toBe(true);
  });

  it('admite el mismo origen', async () => {
    expect(await abrirConexion({ origin: servidor.url })).toBe(true);
  });

  it.each(['https://otro.example.invalid', 'null'])(
    'rechaza el origen ajeno %s aunque traiga una cookie válida',
    async (origin) => {
      expect(await abrirConexion({ origin, cookie: await servidor.modLogin() })).toBe(false);
    },
  );

  it('rechaza otros subdominios aunque pertenezcan al mismo sitio', async () => {
    expect(
      await abrirConexion({
        origin: 'https://otra.udec.cl',
        host: 'pizarra.udec.cl',
        'x-forwarded-proto': 'https',
      }),
    ).toBe(false);
  });

  it('admite Host y protocolo conservados por un proxy de confianza', async () => {
    expect(
      await abrirConexion({
        origin: 'https://pizarra.example.invalid',
        host: 'pizarra.example.invalid',
        'x-forwarded-proto': 'https',
      }),
    ).toBe(true);
  });

  it('rechaza un protocolo distinto aunque coincida Host', async () => {
    expect(await abrirConexion({ origin: servidor.url.replace('http:', 'https:') })).toBe(false);
  });

  it('ignora el protocolo reenviado por un cliente no confiable', async () => {
    await servidor.close();
    servidor = await startServer({ TRUST_PROXY: 'false' });
    expect(
      await abrirConexion({
        origin: servidor.url.replace('http:', 'https:'),
        'x-forwarded-proto': 'https',
      }),
    ).toBe(false);
  });

  it('conserva Vite en desarrollo cuando el proxy usa el puerto del servidor', async () => {
    await servidor.close();
    servidor = await startServer({ NODE_ENV: 'development' });
    expect(await abrirConexion({ origin: 'http://127.0.0.1:5173' })).toBe(true);
  });

  it('la excepción de Vite no aplica a producción', async () => {
    await servidor.close();
    servidor = await startServer({ NODE_ENV: 'production' });
    expect(await abrirConexion({ origin: 'http://127.0.0.1:5173' })).toBe(false);
  });
});
