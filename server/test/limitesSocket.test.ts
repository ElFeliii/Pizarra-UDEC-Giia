import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { RateLimiter } from '../src/moderation/rateLimit';
import { pinInput, startServer } from './helpers';
import { createPin } from '../src/services/content';

type Servidor = Awaited<ReturnType<typeof startServer>>;
let servidor: Servidor;
let ahora: number;
const adicionales: Socket[] = [];
beforeEach(async () => {
  ahora = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => ahora);
  servidor = await startServer();
});
afterEach(async () => {
  for (const socket of adicionales.splice(0)) socket.disconnect();
  await servidor.close();
  vi.restoreAllMocks();
});

describe('presupuesto de eventos antes de acceder a SQLite', () => {
  it('frena suscripciones anónimas antes de consultar cada nota', async () => {
    const socket = await servidor.connect();
    const consulta = vi.spyOn(servidor.ctx.repos.pins, 'get');
    for (let i = 0; i < 61; i++) socket.emit('thread:join', { pinId: 999999 });
    const respuesta = await socket
      .timeout(1000)
      .emitWithAck('pin:create', pinInput('Barrera ficticia'));
    expect(respuesta).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(consulta.mock.calls.length).toBeLessThanOrEqual(60);
    expect(socket.connected).toBe(true);
  });

  it('cuenta también eventos desconocidos y desconecta el abuso repetido', async () => {
    const socket = await servidor.connect();
    const bruto = socket as Socket;
    for (let i = 0; i < 61; i++) bruto.emit('evento:ficticio');
    const respuesta = await socket
      .timeout(1000)
      .emitWithAck('pin:create', pinInput('Barrera ficticia'));
    expect(respuesta).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    const desconexion = new Promise<string>((resolver, rechazar) => {
      const temporizador = setTimeout(
        () => rechazar(new Error('El abuso no se desconectó.')),
        1000,
      );
      socket.once('disconnect', (motivo) => {
        clearTimeout(temporizador);
        resolver(motivo);
      });
    });
    bruto.emit('evento:ficticio');
    expect(await desconexion).toBe('io server disconnect');
    expect((await servidor.app.inject('/api/health')).statusCode).toBe(200);
  });

  it('no evita el presupuesto de conexiones al reconectar desde la misma IP', async () => {
    const primero = await servidor.connect();
    const direccion = servidor.io.sockets.sockets.get(primero.id!)!.data.ip;
    const limite = (
      servidor.ctx.limiters as typeof servidor.ctx.limiters & { conexionSocket?: RateLimiter }
    ).conexionSocket;
    if (limite)
      while (limite.take(direccion).ok) {
        /* Agota únicamente la fixture. */
      }
    primero.disconnect();
    const otro = io(servidor.url, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 1000,
      forceNew: true,
    });
    adicionales.push(otro);
    const conecto = await new Promise<boolean>((resolver) => {
      otro.once('connect', () => resolver(true));
      otro.once('connect_error', () => resolver(false));
    });
    expect(conecto).toBe(false);
    expect((await servidor.app.inject('/api/health')).statusCode).toBe(200);
  });

  it('publicar no materializa todas las notas de asistentes para reservar avisos', async () => {
    const usuario = await servidor.newUser();
    servidor.ctx.db.transaction(() => {
      for (let i = 0; i < 1000; i++)
        servidor.ctx.repos.pins.insert({
          seccion: 'pizarra',
          surface: 'board',
          x: i % 100,
          y: i % 80,
          color: 'verde',
          text: `Contenido ficticio ${i}`,
          userId: usuario.user.id,
          now: 0,
        });
    })();
    const todas = vi.spyOn(servidor.ctx.repos.pins, 'listVisible');
    const avisos = vi.spyOn(servidor.ctx.repos.pins, 'listModeradoresVisibles');
    const resultado = await createPin(
      servidor.ctx,
      usuario.user.id,
      pinInput('Publicación legítima'),
      '192.0.2.1',
    );
    expect(resultado.ok).toBe(true);
    expect(todas).not.toHaveBeenCalled();
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(avisos.mock.results[0]?.value).toEqual([]);
  });

  it('conserva las conexiones y acciones normales de lectores que comparten IP', async () => {
    const lectores = await Promise.all(Array.from({ length: 20 }, () => servidor.connect()));
    await Promise.all(
      lectores.map(async (socket) => {
        socket.emit('thread:join', { pinId: 999999 });
        socket.emit('thread:leave', { pinId: 999999 });
        const resultado = await socket
          .timeout(1000)
          .emitWithAck('pin:create', pinInput('Sin sesión'));
        expect(resultado).toMatchObject({ ok: false, error: { code: 'NO_SESSION' } });
        expect(socket.connected).toBe(true);
      }),
    );
  });
});
