import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResumenIa } from '@pizarra/shared';
import { loadConfig, type ModeracionIaConfig } from '../src/config';
import { BitacoraIa, analyzer } from '../src/moderation/analisis';
import { NORMAS } from '../src/moderation/normas';
import { createPin, createReply } from '../src/services/content';
import { pinInput, startServer } from './helpers';

type Servidor = Awaited<ReturnType<typeof startServer>>;
let servidor: Servidor;

const CON_IA = { OPENAI_API_KEY: 'sk-ficticia-de-prueba' };

const contar = (tabla: 'pins' | 'replies') =>
  (servidor.ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;

describe('revisión con IA antes de publicar', () => {
  afterEach(async () => {
    await servidor.close();
    vi.restoreAllMocks();
  });

  it('sin clave de OpenAI publica como antes, sin consultar a la IA', async () => {
    servidor = await startServer();
    const analizar = vi.spyOn(analyzer, 'analyze');
    const usuario = await servidor.newUser();
    const res = await createPin(servidor.ctx, usuario.user.id, pinInput('Hola a todos'), 'ip');
    expect(res.ok).toBe(true);
    expect(analizar).not.toHaveBeenCalled();
  });

  it('publica lo que la IA aprueba', async () => {
    servidor = await startServer(CON_IA);
    const analizar = vi.spyOn(analyzer, 'analyze').mockResolvedValue({ ok: true, puntajes: {} });
    const usuario = await servidor.newUser();
    const res = await createPin(servidor.ctx, usuario.user.id, pinInput('Qué buena charla'), 'ip');
    expect(res.ok).toBe(true);
    expect(analizar).toHaveBeenCalledWith(
      'Qué buena charla',
      expect.objectContaining({ apiKey: 'sk-ficticia-de-prueba' }),
      expect.any(AbortSignal),
    );
    expect(servidor.ctx.repos.pins.listVisible('pizarra')).toHaveLength(1);
  });

  it('lo que la IA marca no se guarda ni se difunde', async () => {
    servidor = await startServer(CON_IA);
    vi.spyOn(analyzer, 'analyze').mockResolvedValue({
      ok: false,
      categorias: ['harassment'],
      puntajes: { harassment: 0.9 },
    });
    const difundir = vi.spyOn(servidor.ctx.broadcaster, 'pinCreated');
    const usuario = await servidor.newUser();
    const res = await createPin(servidor.ctx, usuario.user.id, pinInput('Texto marcado'), 'ip');
    expect(res).toMatchObject({ ok: false, error: { code: 'IA_RECHAZADO' } });
    expect(contar('pins')).toBe(0);
    expect(difundir).not.toHaveBeenCalled();
  });

  it('si la API falla, la nota queda pendiente hasta que un moderador la aprueba', async () => {
    servidor = await startServer(CON_IA);
    vi.spyOn(analyzer, 'analyze').mockRejectedValue(new Error('OpenAI respondió 503'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const difundir = vi.spyOn(servidor.ctx.broadcaster, 'pinCreated');
    const usuario = await servidor.newUser();
    const res = await createPin(servidor.ctx, usuario.user.id, pinInput('Mensaje en espera'), 'ip');
    expect(res).toMatchObject({ ok: false, error: { code: 'EN_REVISION' } });

    // Guardada, pero invisible para el público y fuera del ranking de palabras.
    expect(contar('pins')).toBe(1);
    expect(servidor.ctx.repos.pins.listVisible('pizarra')).toHaveLength(0);
    expect(difundir).not.toHaveBeenCalled();
    expect(servidor.ctx.topWords.top().map((w) => w.word)).not.toContain('espera');
    const [item] = servidor.ctx.repos.mod.feed();
    expect(item).toMatchObject({ type: 'pin', hiddenReason: 'pendiente', hiddenBy: 'sistema' });

    const cookie = await servidor.modLogin();
    const aprobado = await servidor.app.inject({
      method: 'POST',
      url: `/api/admin/content/pin/${item!.id}/restore`,
      headers: { cookie },
    });
    expect(aprobado.json()).toEqual({ changed: true });
    expect(servidor.ctx.repos.pins.listVisible('pizarra')).toHaveLength(1);
    expect(servidor.ctx.topWords.top().map((w) => w.word)).toContain('espera');
  });

  it('rechazar una nota pendiente la deja oculta como decisión del moderador', async () => {
    servidor = await startServer(CON_IA);
    vi.spyOn(analyzer, 'analyze').mockRejectedValue(new Error('timeout'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const usuario = await servidor.newUser();
    await createPin(servidor.ctx, usuario.user.id, pinInput('Mensaje dudoso'), 'ip');
    const [item] = servidor.ctx.repos.mod.feed();

    const cookie = await servidor.modLogin();
    await servidor.app.inject({
      method: 'POST',
      url: `/api/admin/content/pin/${item!.id}/hide`,
      headers: { cookie },
    });
    expect(servidor.ctx.repos.mod.item('pin', item!.id)).toMatchObject({
      hiddenReason: 'mod',
      hiddenBy: 'Mod Test',
    });
    expect(servidor.ctx.repos.pins.listVisible('pizarra')).toHaveLength(0);
  });

  it('una respuesta pendiente no suma al contador hasta aprobarse', async () => {
    servidor = await startServer(CON_IA);
    const analizar = vi.spyOn(analyzer, 'analyze').mockResolvedValue({ ok: true, puntajes: {} });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const usuario = await servidor.newUser();
    const pin = await createPin(servidor.ctx, usuario.user.id, pinInput('Pregunta'), 'ip');
    if (!pin.ok) throw new Error(pin.error.message);

    analizar.mockRejectedValue(new Error('timeout'));
    const res = await createReply(
      servidor.ctx,
      usuario.user.id,
      { pinId: pin.data.id, text: 'Respuesta en espera' },
      'ip',
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'EN_REVISION' } });
    expect(servidor.ctx.repos.pins.get(pin.data.id)?.replyCount).toBe(0);
    expect(servidor.ctx.repos.replies.listVisibleByPin(pin.data.id)).toHaveLength(0);

    const respuesta = servidor.ctx.repos.mod.feed().find((i) => i.type === 'reply')!;
    const cookie = await servidor.modLogin();
    await servidor.app.inject({
      method: 'POST',
      url: `/api/admin/content/reply/${respuesta.id}/restore`,
      headers: { cookie },
    });
    expect(servidor.ctx.repos.pins.get(pin.data.id)?.replyCount).toBe(1);
    expect(servidor.ctx.repos.replies.listVisibleByPin(pin.data.id)).toHaveLength(1);
  });

  it('los avisos firmados por moderación no pasan por la IA', async () => {
    servidor = await startServer(CON_IA);
    const analizar = vi.spyOn(analyzer, 'analyze');
    const usuario = await servidor.newUser();
    const res = await createPin(
      servidor.ctx,
      usuario.user.id,
      pinInput('Aviso oficial'),
      'ip',
      'Mod Test',
    );
    expect(res.ok).toBe(true);
    expect(analizar).not.toHaveBeenCalled();
  });

  it('vuelve a validar después de la IA: un autor silenciado mientras tanto no publica', async () => {
    servidor = await startServer(CON_IA);
    const usuario = await servidor.newUser();
    vi.spyOn(analyzer, 'analyze').mockImplementation(async () => {
      servidor.ctx.repos.users.setSilenced(usuario.user.id, Date.now());
      return { ok: true, puntajes: {} };
    });
    const res = await createPin(servidor.ctx, usuario.user.id, pinInput('Llega tarde'), 'ip');
    expect(res).toMatchObject({ ok: false, error: { code: 'SILENCED' } });
    expect(contar('pins')).toBe(0);
  });

  it('el panel de moderación ve cada respuesta de la IA, y el público no', async () => {
    servidor = await startServer(CON_IA);
    const analizar = vi.spyOn(analyzer, 'analyze');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const usuario = await servidor.newUser('Ana Prueba');
    analizar.mockResolvedValueOnce({ ok: true, puntajes: { harassment: 0.01, violence: 0.2 } });
    await createPin(servidor.ctx, usuario.user.id, pinInput('Mensaje amable'), 'ip');
    analizar.mockResolvedValueOnce({
      ok: false,
      categorias: ['violence'],
      puntajes: { violence: 0.93, harassment: 0.4, hate: 0.05, sexual: 0.01 },
    });
    await createPin(servidor.ctx, usuario.user.id, pinInput('Mensaje marcado'), 'ip');
    analizar.mockRejectedValueOnce(new Error('OpenAI respondió 401'));
    await createPin(servidor.ctx, usuario.user.id, pinInput('Mensaje sin respuesta'), 'ip');

    expect((await servidor.app.inject({ url: '/api/admin/ia' })).statusCode).toBe(401);
    const cookie = await servidor.modLogin();
    const resumen = (
      await servidor.app.inject({ url: '/api/admin/ia', headers: { cookie } })
    ).json() as ResumenIa;
    expect(resumen).toMatchObject({
      activa: true,
      modelo: 'omni-moderation-latest',
      totales: { publicar: 1, rechazar: 1, revisar: 1 },
    });
    expect(resumen.registros.map((r) => [r.decision, r.texto, r.autor])).toEqual([
      ['revisar', 'Mensaje sin respuesta', 'Ana Prueba'],
      ['rechazar', 'Mensaje marcado', 'Ana Prueba'],
      ['publicar', 'Mensaje amable', 'Ana Prueba'],
    ]);
    expect(resumen.registros[0]!.error).toBe('OpenAI respondió 401');
    // Solo los tres puntajes más altos, ordenados.
    expect(resumen.registros[1]).toMatchObject({
      categorias: ['violence'],
      puntajes: [
        { categoria: 'violence', puntaje: 0.93 },
        { categoria: 'harassment', puntaje: 0.4 },
        { categoria: 'hate', puntaje: 0.05 },
      ],
    });
  });
});

describe('bitácora de la IA', () => {
  it('guarda solo los registros más recientes, pero cuenta todos', () => {
    const bitacora = new BitacoraIa(2);
    for (const texto of ['uno', 'dos', 'tres']) {
      bitacora.anotar({
        at: 0,
        decision: 'publicar',
        ms: 30,
        autor: 'x',
        texto,
        categorias: [],
        puntajes: [],
        error: null,
      });
    }
    const resumen = bitacora.resumen(null);
    expect(resumen.registros.map((r) => r.texto)).toEqual(['tres', 'dos']);
    expect(resumen).toMatchObject({ activa: false, totales: { publicar: 3 }, msPromedio: 30 });
  });
});

describe('cliente de la API de moderación de OpenAI', () => {
  const cfg: ModeracionIaConfig = {
    modo: 'moderation',
    apiKey: 'sk-ficticia',
    modelo: 'omni-moderation-latest',
    umbral: 0.5,
    timeoutMs: 1000,
  };
  const responder = (cuerpo: unknown, status = 200) =>
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(cuerpo), { status }));

  afterEach(() => vi.restoreAllMocks());

  it('envía el texto y el modelo, y aprueba lo no marcado', async () => {
    const fetch = responder({ results: [{ flagged: false, categories: {} }] });
    await expect(analyzer.analyze('hola', cfg, AbortSignal.timeout(1000))).resolves.toEqual({
      ok: true,
      puntajes: {},
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/moderations');
    expect(JSON.parse(init!.body as string)).toEqual({
      model: 'omni-moderation-latest',
      input: 'hola',
    });
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer sk-ficticia');
  });

  it('devuelve las categorías marcadas', async () => {
    responder({
      results: [
        {
          flagged: true,
          categories: { harassment: true, violence: false },
          category_scores: { harassment: 0.91, violence: 0.12 },
        },
      ],
    });
    await expect(analyzer.analyze('x', cfg, AbortSignal.timeout(1000))).resolves.toEqual({
      ok: false,
      categorias: ['harassment'],
      puntajes: { harassment: 0.91, violence: 0.12 },
    });
  });

  it('un error HTTP o una respuesta sin veredicto se tratan como falla', async () => {
    responder({ error: 'caído' }, 503);
    await expect(analyzer.analyze('x', cfg, AbortSignal.timeout(1000))).rejects.toThrow('503');
    vi.restoreAllMocks();
    responder({ results: [] });
    await expect(analyzer.analyze('x', cfg, AbortSignal.timeout(1000))).rejects.toThrow(
      'sin veredicto',
    );
  });
});

describe('cliente de la API Decisions de OpenAI', () => {
  const cfg: ModeracionIaConfig = {
    modo: 'decision',
    apiKey: 'sk-ficticia',
    modelo: 'gpt-6-luna',
    umbral: 0.5,
    timeoutMs: 1000,
  };
  /** Una respuesta con la misma probabilidad para todas las normas, salvo las indicadas. */
  const respuesta = (bajo = 0.02, cambios: Record<string, unknown> = {}) => ({
    answers: NORMAS.map((n) =>
      n.nombre in cambios
        ? { type: 'predicate', name: n.nombre, ...(cambios[n.nombre] as object) }
        : { type: 'predicate', name: n.nombre, probability: bajo },
    ),
  });
  const responder = (cuerpo: unknown, status = 200) =>
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(cuerpo), { status }));

  afterEach(() => vi.restoreAllMocks());

  it('pregunta por cada norma con el contexto aparte del mensaje, y aprueba bajo el umbral', async () => {
    const fetch = responder(respuesta());
    const v = await analyzer.analyze('Qué buena charla', cfg, AbortSignal.timeout(1000));
    expect(v).toMatchObject({ ok: true, puntajes: { acoso: 0.02, violencia: 0.02 } });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/decisions');
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.input).toEqual([
      { role: 'developer', content: [expect.objectContaining({ type: 'input_text' })] },
      { role: 'user', content: [{ type: 'input_text', text: 'Qué buena charla' }] },
    ]);
    expect(body.questions).toEqual(
      NORMAS.map((n) => ({ type: 'predicate', name: n.nombre, instructions: n.instrucciones })),
    );
  });

  it('rechaza las normas que llegan al umbral', async () => {
    responder(respuesta(0.02, { violencia: { probability: 0.5 }, acoso: { probability: 0.81 } }));
    await expect(analyzer.analyze('x', cfg, AbortSignal.timeout(1000))).resolves.toMatchObject({
      ok: false,
      categorias: ['acoso', 'violencia'],
    });
    vi.restoreAllMocks();
    // Con un umbral más alto, el mismo mensaje pasa.
    responder(respuesta(0.02, { violencia: { probability: 0.5 }, acoso: { probability: 0.81 } }));
    await expect(
      analyzer.analyze('x', { ...cfg, umbral: 0.9 }, AbortSignal.timeout(1000)),
    ).resolves.toMatchObject({ ok: true });
  });

  it('una negativa, una norma faltante o un error HTTP dejan el mensaje para un humano', async () => {
    responder(respuesta(0.02, { sexual: { type: 'refusal', probability: undefined } }));
    await expect(analyzer.analyze('x', cfg, AbortSignal.timeout(1000))).rejects.toThrow(
      'no quiso evaluar la norma sexual',
    );
    vi.restoreAllMocks();
    responder({ answers: respuesta().answers.slice(1) });
    await expect(analyzer.analyze('x', cfg, AbortSignal.timeout(1000))).rejects.toThrow(
      `sin la norma ${NORMAS[0]!.nombre}`,
    );
    vi.restoreAllMocks();
    responder({ error: { message: 'modelo no disponible' } }, 404);
    await expect(analyzer.analyze('x', cfg, AbortSignal.timeout(1000))).rejects.toThrow('404');
  });
});

describe('elección del modo por variables de entorno', () => {
  const base = { NODE_ENV: 'test', DB_PATH: ':memory:', OPENAI_API_KEY: 'sk-x' };

  it('por omisión usa la API de moderación', () => {
    expect(loadConfig(base, []).moderacionIa).toMatchObject({
      modo: 'moderation',
      modelo: 'omni-moderation-latest',
    });
  });

  it('MODERACION_IA_MODO=decision usa la API Decisions con su modelo y umbral', () => {
    expect(
      loadConfig({ ...base, MODERACION_IA_MODO: 'decision', MODERACION_IA_UMBRAL: '0.7' }, [])
        .moderacionIa,
    ).toMatchObject({ modo: 'decision', modelo: 'gpt-6-luna', umbral: 0.7 });
  });

  it('rechaza un modo o un umbral inválidos al arrancar', () => {
    expect(() => loadConfig({ ...base, MODERACION_IA_MODO: 'otro' }, [])).toThrow();
    expect(() => loadConfig({ ...base, MODERACION_IA_UMBRAL: '1.5' }, [])).toThrow();
  });
});
