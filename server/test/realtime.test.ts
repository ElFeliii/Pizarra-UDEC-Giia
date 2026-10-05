import {
  CAMPUS_AREA,
  OUTSIDE_CAMPUS_MESSAGE,
  type PinSummary,
  type PinsSnapshot,
  type Thread,
} from '@pizarra/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedWordlist } from '../src/services/moderation';
import { once, pinInput, startServer } from './helpers';

type Server = Awaited<ReturnType<typeof startServer>>;
let s: Server;

beforeEach(async () => {
  s = await startServer();
});
afterEach(async () => {
  await s.close();
});

describe('sesión', () => {
  it('crea sesión y la verifica con el token', async () => {
    const { token, user } = await s.newUser('Ana', 'colegio-ejemplo-1');
    expect(user.name).toBe('Ana');
    const res = await s.app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.institutionName).toBe('Colegio ejemplo 1');
  });

  it('rechaza nombres ofensivos e instituciones inválidas', async () => {
    const bad = await s.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { name: 'el weon', institutionId: 'colegio-ejemplo-1' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('CENSORED');

    const inst = await s.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { name: 'Ana', institutionId: 'no-existe' },
    });
    expect(inst.statusCode).toBe(400);
  });

  it('acepta "Otra" con texto libre (censurado)', async () => {
    const ok = await s.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { name: 'Luis', institutionId: 'otra', institutionOther: 'Liceo de Lota' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().user.institutionName).toBe('Liceo de Lota');

    const missing = await s.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { name: 'Luis', institutionId: 'otra' },
    });
    expect(missing.statusCode).toBe(400);
  });

  it('un socket sin sesión no puede publicar', async () => {
    const anon = await s.connect();
    const res = await anon.emitWithAck('pin:create', pinInput('hola'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_SESSION');
  });
});

describe('pines y respuestas en tiempo real', () => {
  it('un pin nuevo llega a los demás y las respuestas hacen crecer el contador', async () => {
    const a = await s.newUser('Ana');
    const b = await s.newUser('Beto');
    const sa = await s.connect(a.token);
    const sb = await s.connect(b.token);

    const created = once(sb, 'pin:created');
    const ack = await sa.emitWithAck('pin:create', pinInput('¿Dónde queda la biblioteca central?'));
    expect(ack.ok).toBe(true);
    const [pin] = await created;
    expect(pin.preview).toBe('¿Dónde queda la biblioteca central?');
    expect(pin.authorName).toBe('Ana');
    expect(pin.replyCount).toBe(0);

    // B abre el hilo y responde; A recibe el contador actualizado en el lote.
    sb.emit('thread:join', { pinId: pin.id });
    await new Promise((r) => setTimeout(r, 50));
    const replyEvent = once(sb, 'reply:created');
    const counts = once(sa, 'pins:updated');
    const r = await sb.emitWithAck('reply:create', { pinId: pin.id, text: 'Frente al arco' });
    expect(r.ok).toBe(true);
    const [reply] = await replyEvent;
    expect(reply.text).toBe('Frente al arco');
    const [updates] = await counts;
    expect(updates).toContainEqual({ id: pin.id, replyCount: 1 });

    const thread = (await s.app.inject({ url: `/api/pins/${pin.id}/thread` })).json() as Thread;
    expect(thread.pin.text).toBe('¿Dónde queda la biblioteca central?');
    expect(thread.replies).toHaveLength(1);
  });

  it('rechaza groserías, links, datos personales y duplicados', async () => {
    const a = await s.newUser();
    const sa = await s.connect(a.token);
    const codes: string[] = [];
    for (const text of ['esto es una mierda', 'mira www.algo.cl', 'mi fono 912345678']) {
      const res = await sa.emitWithAck('pin:create', pinInput(text));
      if (!res.ok) codes.push(res.error.code);
    }
    expect(codes).toEqual(['CENSORED', 'LINKS', 'PERSONAL_DATA']);

    const b = await s.newUser();
    const sb = await s.connect(b.token);
    const first = await sb.emitWithAck('pin:create', pinInput('Hola a todos'));
    expect(first.ok).toBe(true);
    const dup = await sb.emitWithAck('pin:create', pinInput('Hola a todos', 300, 300));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('DUPLICATE');
  });

  it('muchos rechazos seguidos obligan a esperar (anti-evasión)', async () => {
    const a = await s.newUser();
    const sa = await s.connect(a.token);
    const codes: string[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await sa.emitWithAck('pin:create', pinInput(`mierda ${i}`));
      if (!res.ok) codes.push(res.error.code);
    }
    expect(codes.slice(0, 6).every((c) => c === 'CENSORED')).toBe(true);
    expect(codes[6]).toBe('RATE_LIMITED');
  });

  it('limita la cantidad de pines seguidos', async () => {
    const a = await s.newUser();
    const sa = await s.connect(a.token);
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(await sa.emitWithAck('pin:create', pinInput(`Pin ${i}`)));
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
    const last = results[2]!;
    if (!last.ok) expect(last.error.code).toBe('RATE_LIMITED');
  });

  it('en el mapa solo acepta pines dentro del campus', async () => {
    const a = await s.newUser();
    const sa = await s.connect(a.token);

    // Dentro del contorno de la universidad.
    const b = CAMPUS_AREA.boundary;
    const cx = b.reduce((sum, p) => sum + p[0], 0) / b.length;
    const cy = b.reduce((sum, p) => sum + p[1], 0) / b.length;
    const dentro = await sa.emitWithAck('pin:create', {
      surface: 'map',
      x: cx,
      y: cy,
      color: 'azul',
      text: '¿Dónde queda la sala de estudio?',
    });
    expect(dentro.ok).toBe(true);
    if (dentro.ok) expect(dentro.data.surface).toBe('map');

    // Esquina del lienzo: está en el mapa, pero fuera de la universidad.
    const fuera = await sa.emitWithAck('pin:create', {
      surface: 'map',
      x: 2,
      y: 2,
      color: 'azul',
      text: 'Esto está fuera del campus',
    });
    expect(fuera.ok).toBe(false);
    if (!fuera.ok) {
      expect(fuera.error.code).toBe('VALIDATION');
      expect(fuera.error.message).toBe(OUTSIDE_CAMPUS_MESSAGE);
    }
  });

  it('valida coordenadas y colores', async () => {
    const a = await s.newUser();
    const sa = await s.connect(a.token);
    const res = await sa.emitWithAck('pin:create', { ...pinInput('hola'), x: -5 });
    expect(res.ok).toBe(false);
    const res2 = await sa.emitWithAck('pin:create', {
      ...pinInput('hola'),
      color: 'negro' as never,
    });
    expect(res2.ok).toBe(false);
  });

  it('sincronización incremental con ?since', async () => {
    const a = await s.newUser();
    const sa = await s.connect(a.token);
    const snap = (await s.app.inject({ url: '/api/pins' })).json() as PinsSnapshot;
    expect(snap.pins).toHaveLength(0);
    await sa.emitWithAck('pin:create', pinInput('Nuevo'));
    const delta = (
      await s.app.inject({ url: `/api/pins?since=${snap.serverTime}` })
    ).json() as PinsSnapshot;
    expect(delta.pins.map((p) => p.preview)).toEqual(['Nuevo']);
  });
});

describe('búsqueda y palabras más repetidas', () => {
  it('busca sin importar tildes y cuenta palabras', async () => {
    const users = await Promise.all([s.newUser(), s.newUser(), s.newUser()]);
    for (const u of users) {
      const sock = await s.connect(u.token);
      await sock.emitWithAck('pin:create', pinInput(`Me encanta la programación ${u.user.id}`));
    }
    const hits = (await s.app.inject({ url: '/api/search?q=programacion' })).json();
    expect(hits).toHaveLength(3);
    expect(hits[0].snippet).toContain('\uE000');

    const top = (await s.app.inject({ url: '/api/words/top' })).json() as {
      word: string;
      count: number;
    }[];
    expect(top[0]).toMatchObject({ count: 3 });
    expect(top.map((w) => w.word)).toEqual(expect.arrayContaining(['encanta', 'programación']));
    expect(top.map((w) => w.word)).not.toContain('la');
  });
});

describe('reportes y moderación', () => {
  async function pinBy(text: string): Promise<{ pin: PinSummary; token: string }> {
    const a = await s.newUser();
    const sa = await s.connect(a.token);
    const res = await sa.emitWithAck('pin:create', pinInput(text));
    if (!res.ok) throw new Error(res.error.message);
    return { pin: res.data, token: a.token };
  }

  it('3 reportes distintos ocultan el pin y lo mandan a revisión', async () => {
    const { pin } = await pinBy('contenido molesto');
    const watcher = await s.connect((await s.newUser()).token);
    const removed = once(watcher, 'pin:removed');

    for (let i = 0; i < 3; i++) {
      const r = await s.connect((await s.newUser()).token);
      const res = await r.emitWithAck('report:create', { targetType: 'pin', targetId: pin.id });
      expect(res.ok).toBe(true);
      // Reportar dos veces no cuenta doble.
      await r.emitWithAck('report:create', { targetType: 'pin', targetId: pin.id });
    }
    expect((await removed)[0]).toEqual({ id: pin.id });

    const snap = (await s.app.inject({ url: '/api/pins' })).json() as PinsSnapshot;
    expect(snap.pins.find((p) => p.id === pin.id)).toBeUndefined();

    const cookie = await s.modLogin();
    const queue = (
      await s.app.inject({ url: '/api/admin/reports', headers: { cookie } })
    ).json() as { id: number; hiddenReason: string; reportCount: number }[];
    expect(queue[0]).toMatchObject({ id: pin.id, hiddenReason: 'reports', reportCount: 3 });

    // El moderador lo restaura: vuelve a la pizarra y sale de la cola.
    const restored = once(watcher, 'pin:restored');
    const res = await s.app.inject({
      method: 'POST',
      url: `/api/admin/content/pin/${pin.id}/restore`,
      headers: { cookie },
    });
    expect(res.json()).toEqual({ changed: true });
    expect((await restored)[0].id).toBe(pin.id);
    const queue2 = (await s.app.inject({ url: '/api/admin/reports', headers: { cookie } })).json();
    expect(queue2).toHaveLength(0);
  });

  it('las rutas de moderador exigen sesión', async () => {
    expect((await s.app.inject({ url: '/api/admin/stats' })).statusCode).toBe(401);
    const bad = await s.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'mala', moderatorName: 'X y' },
    });
    expect(bad.statusCode).toBe(401);
    const cookie = await s.modLogin();
    const stats = await s.app.inject({ url: '/api/admin/stats', headers: { cookie } });
    expect(stats.statusCode).toBe(200);
  });

  it('ocultar una respuesta baja el contador; silenciar bloquea publicar', async () => {
    const { pin } = await pinBy('Pregunta');
    const b = await s.newUser('Beto');
    const sb = await s.connect(b.token);
    const r = await sb.emitWithAck('reply:create', { pinId: pin.id, text: 'Respuesta' });
    if (!r.ok) throw new Error(r.error.message);

    const cookie = await s.modLogin();
    const counts = once(sb, 'pins:updated');
    await s.app.inject({
      method: 'POST',
      url: `/api/admin/content/reply/${r.data.id}/hide`,
      headers: { cookie },
    });
    expect((await counts)[0]).toContainEqual({ id: pin.id, replyCount: 0 });

    const silenced = once(sb, 'session:silenced');
    await s.app.inject({
      method: 'POST',
      url: `/api/admin/users/${b.user.id}/silence`,
      headers: { cookie },
    });
    await silenced;
    const res = await sb.emitWithAck('reply:create', { pinId: pin.id, text: 'otra' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('SILENCED');
  });

  it('la semilla se carga una sola vez y no se duplica', async () => {
    const cookie = await s.modLogin();
    const palabras = (
      await s.app.inject({ url: '/api/admin/words', headers: { cookie } })
    ).json() as { term: string }[];
    expect(palabras.length).toBeGreaterThan(250);
    // Volver a sembrar sobre la misma base no agrega nada.
    expect(seedWordlist(s.ctx)).toBe(0);
    const otraVez = (
      await s.app.inject({ url: '/api/admin/words', headers: { cookie } })
    ).json() as { term: string }[];
    expect(otraVez.length).toBe(palabras.length);
  });

  it('una palabra nueva se aplica en caliente y de forma retroactiva', async () => {
    const { pin } = await pinBy('Los zapallos son geniales');
    const cookie = await s.modLogin();
    const add = await s.app.inject({
      method: 'POST',
      url: '/api/admin/words',
      headers: { cookie },
      payload: { term: 'zapallo', mode: 'prefix' },
    });
    expect(add.statusCode).toBe(201);
    const id = add.json().id as number;

    const u = await s.connect((await s.newUser()).token);
    const blocked = await u.emitWithAck('pin:create', pinInput('Viva el ZAPALLO'));
    expect(blocked.ok).toBe(false);

    const applied = await s.app.inject({
      method: 'POST',
      url: `/api/admin/words/${id}/apply`,
      headers: { cookie },
    });
    expect(applied.json()).toEqual({ pins: 1, replies: 0 });
    const snap = (await s.app.inject({ url: '/api/pins' })).json() as PinsSnapshot;
    expect(snap.pins.find((p) => p.id === pin.id)).toBeUndefined();
  });

  it('exporta CSV con BOM y separador ;', async () => {
    await pinBy('Texto; con "comillas"');
    const cookie = await s.modLogin();
    const res = await s.app.inject({ url: '/api/admin/export/pins.csv', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body.startsWith('\uFEFFID;Fecha;Autor')).toBe(true);
    expect(res.body).toContain('"Texto; con ""comillas"""');
  });
});
