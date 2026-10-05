import type { PinSummary, PinsSnapshot } from '@pizarra/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestSocket } from './helpers';

type Servidor = Awaited<ReturnType<typeof startServer>>;

let s: Servidor;
let socket: TestSocket;
let cookie: string;

const nota = (seccion: string, text: string) => ({ seccion, color: 'verde' as const, text });
const listar = async (seccion: string) =>
  (
    (
      await s.app.inject({ method: 'GET', url: `/api/pins?seccion=${seccion}` })
    ).json() as PinsSnapshot
  ).pins;

beforeAll(async () => {
  s = await startServer();
  cookie = await s.modLogin();
  const { token } = await s.newUser();
  socket = await s.connect(token);
});
afterAll(async () => {
  await s.close();
});

describe('muros', () => {
  it('publica una nota sin lugar y la devuelve en su sección', async () => {
    const res = await socket.emitWithAck(
      'nota:create',
      nota('consejos', 'Llega temprano al casino'),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ seccion: 'consejos', x: 0, y: 0, replyCount: 0, vistas: 0 });

    const consejos = await listar('consejos');
    expect(consejos.map((p) => p.id)).toContain(res.data.id);
  });

  it('cada sección ve solo lo suyo', async () => {
    await socket.emitWithAck('nota:create', nota('historias', 'Dicen que el Campanil suena solo'));
    const historias = await listar('historias');
    const consejos = await listar('consejos');
    const pizarra = await listar('pizarra');

    expect(historias).toHaveLength(1);
    expect(historias[0]!.preview).toContain('Campanil');
    expect(consejos.every((p) => p.seccion === 'consejos')).toBe(true);
    expect(pizarra).toHaveLength(0);
  });

  it('rechaza secciones que no existen o que no son muros', async () => {
    const inventada = await socket.emitWithAck('nota:create', nota('no-existe', 'Hola'));
    expect(inventada.ok).toBe(false);
    // El mapa es un lienzo: ahí las notas van con coordenadas, no por acá.
    const lienzo = await socket.emitWithAck('nota:create', nota('mapa', 'Hola'));
    expect(lienzo.ok).toBe(false);
  });

  it('el filtro de groserías también corre en los muros', async () => {
    const res = await socket.emitWithAck('nota:create', nota('consejos', 'eres un im bec il'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CENSORED');
  });

  it('con la sección cerrada no se publica, pero se sigue leyendo', async () => {
    await s.app.inject({
      method: 'POST',
      url: '/api/admin/secciones/consejos',
      headers: { cookie },
      payload: { estado: 'solo_lectura' },
    });

    const res = await socket.emitWithAck('nota:create', nota('consejos', 'Otro consejo más'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('SECCION_CERRADA');
    expect((await listar('consejos')).length).toBeGreaterThan(0);
  });

  it('se puede responder una nota de muro como cualquier otra', async () => {
    await s.app.inject({
      method: 'POST',
      url: '/api/admin/secciones/historias',
      headers: { cookie },
      payload: { estado: 'abierta' },
    });
    const historias = await listar('historias');
    const pinId = historias[0]!.id;

    const res = await socket.emitWithAck('reply:create', {
      pinId,
      text: 'A mí me contaron lo mismo',
    });
    expect(res.ok).toBe(true);

    const thread = (
      await s.app.inject({ method: 'GET', url: `/api/pins/${pinId}/thread` })
    ).json() as {
      pin: PinSummary;
      replies: unknown[];
    };
    expect(thread.replies).toHaveLength(1);
  });

  it('la búsqueda no mezcla secciones', async () => {
    const enHistorias = (
      (
        await s.app.inject({ method: 'GET', url: '/api/search?seccion=historias&q=campanil' })
      ).json() as unknown[]
    ).length;
    const enConsejos = (
      (
        await s.app.inject({ method: 'GET', url: '/api/search?seccion=consejos&q=campanil' })
      ).json() as unknown[]
    ).length;
    expect(enHistorias).toBeGreaterThan(0);
    expect(enConsejos).toBe(0);
  });
});
