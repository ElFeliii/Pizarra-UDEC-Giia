import type { PinSummary } from '@pizarra/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { once, pinInput, startServer, type TestSocket } from './helpers';

type Servidor = Awaited<ReturnType<typeof startServer>>;

let s: Servidor;
let socket: TestSocket;
let pinId: number;

/** Espera el lote de contadores que trae la nota pedida (viajan cada 500 ms). */
async function esperarVistas(id: number): Promise<number | undefined> {
  const [updates] = await once(socket, 'pins:updated');
  return updates.find((u) => u.id === id)?.vistas;
}

beforeAll(async () => {
  s = await startServer();
  const { token } = await s.newUser();
  socket = await s.connect(token);
  const res = await socket.emitWithAck('pin:create', pinInput('Una nota para mirar'));
  if (!res.ok) throw new Error('no se pudo crear el pin');
  pinId = res.data.id;
});
afterAll(async () => {
  await s.close();
});

describe('visitas a una nota', () => {
  it('una nota nueva parte sin visitas', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/pins?surface=board' });
    const { pins } = res.json() as { pins: PinSummary[] };
    expect(pins.find((p) => p.id === pinId)?.vistas).toBe(0);
  });

  it('cuenta a quien la abre y lo avisa a todos', async () => {
    const espera = esperarVistas(pinId);
    socket.emit('pin:visto', { pinId, visitante: 'visitante-uno' });
    expect(await espera).toBe(1);
  });

  it('la misma persona no cuenta dos veces', async () => {
    socket.emit('pin:visto', { pinId, visitante: 'visitante-uno' });
    socket.emit('pin:visto', { pinId, visitante: 'visitante-uno' });
    // Solo la de otra persona genera aviso; si las repetidas contaran, llegaría antes un 2.
    const espera = esperarVistas(pinId);
    socket.emit('pin:visto', { pinId, visitante: 'visitante-dos' });
    expect(await espera).toBe(2);
  });

  it('no necesita sesión: también cuenta quien solo está mirando', async () => {
    const anonimo = await s.connect();
    const espera = esperarVistas(pinId);
    anonimo.emit('pin:visto', { pinId, visitante: 'visitante-sin-cuenta' });
    expect(await espera).toBe(3);
  });

  it('ignora en silencio lo que no corresponde', async () => {
    // Nota inexistente, identificador muy corto y datos con forma equivocada: nada revienta.
    socket.emit('pin:visto', { pinId: 999_999, visitante: 'visitante-uno' });
    socket.emit('pin:visto', { pinId, visitante: 'xx' });
    // @ts-expect-error: a propósito, para comprobar que el servidor aguanta basura
    socket.emit('pin:visto', { pinId: 'no-es-un-numero' });

    const espera = esperarVistas(pinId);
    socket.emit('pin:visto', { pinId, visitante: 'visitante-tres' });
    expect(await espera).toBe(4);
  });

  it('las visitas quedan guardadas y se leen con la nota', async () => {
    const res = await s.app.inject({ method: 'GET', url: `/api/pins/${pinId}/thread` });
    expect((res.json() as { pin: PinSummary }).pin.vistas).toBe(4);
  });
});
