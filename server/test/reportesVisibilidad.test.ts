import type { TargetType, Tema } from '@pizarra/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cambiarEstado } from '../src/services/secciones';
import { agregarPregunta, cambiarPreguntaOculta } from '../src/services/temas';
import { moderatorHide } from '../src/services/moderation';
import { pinInput, startServer } from './helpers';

let servidor: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  servidor = await startServer();
});
afterEach(async () => {
  await servidor.close();
});

async function contenido(conTema = false) {
  const autor = await servidor.connect((await servidor.newUser()).token);
  let tema: Tema | undefined;
  if (conTema) {
    const creada = agregarPregunta(
      servidor.ctx,
      { nombre: 'Pregunta del equipo para probar' },
      'Mod Test',
    );
    if (!creada.ok) throw new Error(creada.error.message);
    tema = creada.data;
  }
  const nota = conTema
    ? await autor.emitWithAck('nota:create', {
        seccion: 'faq',
        temaId: tema!.id,
        text: 'Nota para comprobar reportes',
        color: 'verde',
      })
    : await autor.emitWithAck('pin:create', pinInput('Nota para comprobar reportes'));
  if (!nota.ok) throw new Error(nota.error.message);
  const respuesta = await autor.emitWithAck('reply:create', {
    pinId: nota.data.id,
    text: 'Respuesta para comprobar reportes',
  });
  if (!respuesta.ok) throw new Error(respuesta.error.message);
  return { nota: nota.data, respuesta: respuesta.data, tema };
}

describe('los reportes requieren que todo el objetivo sea público', () => {
  it.each([
    ['pin', 'seccion'],
    ['reply', 'seccion'],
    ['pin', 'tema'],
    ['reply', 'tema'],
    ['reply', 'padre'],
    ['pin', 'objetivo'],
    ['reply', 'objetivo'],
  ] as const)(
    'rechaza reportar %s cuando está oculto por %s sin alterar contenido o cola',
    async (tipo, causa) => {
      const { nota, respuesta, tema } = await contenido(causa === 'tema');
      const id = tipo === 'pin' ? nota.id : respuesta.id;
      if (causa === 'seccion') cambiarEstado(servidor.ctx, nota.seccion, 'oculta', 'Mod Test');
      if (causa === 'tema') cambiarPreguntaOculta(servidor.ctx, tema!.id, true, 'Mod Test');
      if (causa === 'padre') moderatorHide(servidor.ctx, 'pin', nota.id, 'Mod Test');
      if (causa === 'objetivo') moderatorHide(servidor.ctx, tipo, id, 'Mod Test');
      const anterior = {
        nota: servidor.ctx.repos.pins.get(nota.id),
        respuesta: servidor.ctx.repos.replies.get(respuesta.id),
      };
      const difusion = vi.spyOn(servidor.ctx.broadcaster, 'modReport');
      for (let numero = 0; numero < 3; numero++) {
        const reportador = await servidor.connect((await servidor.newUser()).token);
        const resultado = await reportador.emitWithAck('report:create', {
          targetType: tipo,
          targetId: id,
        });
        expect(resultado).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      }
      expect(servidor.ctx.db.prepare('SELECT COUNT(*) AS n FROM reports').get()).toEqual({ n: 0 });
      expect(servidor.ctx.repos.reports.queue()).toEqual([]);
      expect(difusion).not.toHaveBeenCalled();
      expect(servidor.ctx.repos.pins.get(nota.id)).toEqual(anterior.nota);
      expect(servidor.ctx.repos.replies.get(respuesta.id)).toEqual(anterior.respuesta);
    },
  );

  it.each(['pin', 'reply'] as const)(
    'conserva reportes idempotentes sobre %s público en una sección solo de lectura',
    async (tipo: TargetType) => {
      const { nota, respuesta } = await contenido();
      cambiarEstado(servidor.ctx, nota.seccion, 'solo_lectura', 'Mod Test');
      const id = tipo === 'pin' ? nota.id : respuesta.id;
      const reportador = await servidor.connect((await servidor.newUser()).token);
      const entrada = { targetType: tipo, targetId: id };
      expect(await reportador.emitWithAck('report:create', entrada)).toEqual({
        ok: true,
        data: { received: true },
      });
      expect(await reportador.emitWithAck('report:create', entrada)).toEqual({
        ok: true,
        data: { received: true },
      });
      expect(servidor.ctx.repos.reports.openCount(tipo, id)).toBe(1);
      expect(
        (tipo === 'pin' ? servidor.ctx.repos.pins : servidor.ctx.repos.replies).get(id)?.hiddenAt,
      ).toBeNull();
    },
  );
});
