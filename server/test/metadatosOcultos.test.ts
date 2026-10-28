import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopWord } from '@pizarra/shared';
import { createNota, createPin, createReply } from '../src/services/content';
import { hideContent, reloadCensor, restoreContent } from '../src/services/moderation';
import { cambiarEstado } from '../src/services/secciones';
import { agregarPregunta, cambiarPreguntaOculta } from '../src/services/temas';
import { once, pinInput, startServer } from './helpers';

type Servidor = Awaited<ReturnType<typeof startServer>>;
let servidor: Servidor;

beforeEach(async () => {
  servidor = await startServer();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await servidor.close();
});

async function ranking(): Promise<TopWord[]> {
  const resultado = await servidor.app.inject('/api/words/top');
  expect(resultado.statusCode).toBe(200);
  return resultado.json();
}

describe('metadatos públicos de los temas', () => {
  it('agregar una pregunta en una sección oculta no transmite su título', async () => {
    const lector = await servidor.connect();
    cambiarEstado(servidor.ctx, 'faq', 'oculta', 'Prueba');
    const evento = once(lector, 'tema:actualizado');
    const resultado = agregarPregunta(
      servidor.ctx,
      { nombre: 'Pregunta reservada para el ensayo' },
      'Prueba',
    );
    if (!resultado.ok) throw new Error(resultado.error.message);
    const [retirada] = await evento;
    expect(retirada.id).toBe(resultado.data.id);
    expect(retirada.oculto).toBe(true);
    expect(JSON.stringify(retirada)).not.toContain('Pregunta reservada');
    expect(retirada.nombre).toBe('');
    expect(retirada.grupo).toBeNull();
    expect(retirada.campus).toBeNull();
    expect((await servidor.app.inject('/api/temas')).json()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: retirada.id })]),
    );
  });

  it('ocultar y restaurar preguntas mantiene la actualización instantánea sin repetir metadatos privados', async () => {
    cambiarEstado(servidor.ctx, 'faq', 'abierta', 'Prueba');
    const lector = await servidor.connect();
    const nueva = once(lector, 'tema:actualizado');
    const pregunta = agregarPregunta(
      servidor.ctx,
      { nombre: 'Pregunta visible del ensayo' },
      'Prueba',
    );
    if (!pregunta.ok) throw new Error(pregunta.error.message);
    expect((await nueva)[0].nombre).toBe('Pregunta visible del ensayo');
    servidor.ctx.db
      .prepare('UPDATE temas SET grupo = ?, campus = ? WHERE id = ?')
      .run('Grupo reservado', 'Campus reservado', pregunta.data.id);
    const ocultada = once(lector, 'tema:actualizado');
    cambiarPreguntaOculta(servidor.ctx, pregunta.data.id, true, 'Prueba');
    const [retirada] = await ocultada;
    expect(retirada.id).toBe(pregunta.data.id);
    expect(retirada.oculto).toBe(true);
    expect(retirada.nombre).toBe('');
    expect(retirada.grupo).toBeNull();
    expect(retirada.campus).toBeNull();
    const restaurada = once(lector, 'tema:actualizado');
    cambiarPreguntaOculta(servidor.ctx, pregunta.data.id, false, 'Prueba');
    expect((await restaurada)[0]).toMatchObject({
      id: pregunta.data.id,
      oculto: false,
      nombre: 'Pregunta visible del ensayo',
      grupo: 'Grupo reservado',
      campus: 'Campus reservado',
    });
  });
});

describe('ranking limitado a contenido público', () => {
  it.each(['nota', 'seccion', 'tema'])(
    'excluye una %s oculta y sus respuestas, sin afectar las otras notas',
    async (ambito) => {
      cambiarEstado(servidor.ctx, 'faq', 'abierta', 'Prueba');
      const tema = agregarPregunta(
        servidor.ctx,
        { nombre: 'Pregunta para contar palabras' },
        'Prueba',
      );
      if (!tema.ok) throw new Error(tema.error.message);
      const usuario = await servidor.newUser();
      const otro = await servidor.newUser();
      const nota = await createNota(
        servidor.ctx,
        usuario.user.id,
        { seccion: 'faq', temaId: tema.data.id, color: 'verde', text: 'cobalto' },
        'ip-prueba',
      );
      if (!nota.ok) throw new Error(nota.error.message);
      const respuesta = await createReply(
        servidor.ctx,
        usuario.user.id,
        { pinId: nota.data.id, text: 'granito' },
        'ip-prueba',
      );
      if (!respuesta.ok) throw new Error(respuesta.error.message);
      expect(
        (await createPin(servidor.ctx, otro.user.id, pinInput('granito alameda'), 'ip-prueba')).ok,
      ).toBe(true);
      expect(await ranking()).toEqual(
        expect.arrayContaining([
          { word: 'granito', count: 2 },
          { word: 'cobalto', count: 1 },
        ]),
      );
      const cambiar = (oculto: boolean) => {
        if (ambito === 'nota') {
          if (oculto) hideContent(servidor.ctx, 'pin', nota.data.id, 'Prueba', 'mod');
          else restoreContent(servidor.ctx, 'pin', nota.data.id, 'Prueba');
        }
        if (ambito === 'seccion')
          cambiarEstado(servidor.ctx, 'faq', oculto ? 'oculta' : 'abierta', 'Prueba');
        if (ambito === 'tema') cambiarPreguntaOculta(servidor.ctx, tema.data.id, oculto, 'Prueba');
      };
      cambiar(true);
      expect(await ranking()).toEqual([
        { word: 'alameda', count: 1 },
        { word: 'granito', count: 1 },
      ]);
      hideContent(servidor.ctx, 'reply', respuesta.data.id, 'Prueba', 'mod');
      expect(await ranking()).toEqual([
        { word: 'alameda', count: 1 },
        { word: 'granito', count: 1 },
      ]);
      restoreContent(servidor.ctx, 'reply', respuesta.data.id, 'Prueba');
      expect(await ranking()).toEqual([
        { word: 'alameda', count: 1 },
        { word: 'granito', count: 1 },
      ]);
      cambiar(false);
      expect(await ranking()).toEqual(
        expect.arrayContaining([
          { word: 'granito', count: 2 },
          { word: 'cobalto', count: 1 },
        ]),
      );
      hideContent(servidor.ctx, 'reply', respuesta.data.id, 'Prueba', 'mod');
      expect((await ranking()).find((palabra) => palabra.word === 'granito')?.count).toBe(1);
    },
  );

  it('los presets de sección actualizan el contador según la visibilidad', async () => {
    const usuario = await servidor.newUser();
    expect(
      (await createPin(servidor.ctx, usuario.user.id, pinInput('telescopio'), 'ip-prueba')).ok,
    ).toBe(true);
    cambiarEstado(servidor.ctx, 'pizarra', 'oculta', 'Prueba');
    expect(await ranking()).toEqual([]);
    const { aplicarPreset } = await import('../src/services/secciones');
    aplicarPreset(servidor.ctx, 'universitarios', 'Prueba');
    expect(await ranking()).toEqual([{ word: 'telescopio', count: 1 }]);
  });

  it('repara contadores previos al cargar el filtro y no recorre el corpus por cada publicación', async () => {
    const usuario = await servidor.newUser();
    const pin = await createPin(servidor.ctx, usuario.user.id, pinInput('cobalto'), 'ip-prueba');
    if (!pin.ok) throw new Error(pin.error.message);
    cambiarEstado(servidor.ctx, 'pizarra', 'oculta', 'Prueba');
    servidor.ctx.db.exec("INSERT INTO word_counts VALUES ('reservado', 'reservado', 99)");
    reloadCensor(servidor.ctx);
    expect(await ranking()).toEqual([]);
    cambiarEstado(servidor.ctx, 'pizarra', 'abierta', 'Prueba');
    expect(await ranking()).toEqual([{ word: 'cobalto', count: 1 }]);
    const consulta = vi.spyOn(servidor.ctx.repos.wordCounts, 'textosVisibles');
    const cache = vi.spyOn(servidor.ctx.repos.wordCounts, 'top');
    const otro = await servidor.newUser();
    expect((await createPin(servidor.ctx, otro.user.id, pinInput('alameda'), 'ip-prueba')).ok).toBe(
      true,
    );
    await ranking();
    await ranking();
    expect(cache).toHaveBeenCalledTimes(1);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('words:top no vuelve a difundir palabras de una sección oculta', async () => {
    const usuario = await servidor.newUser();
    expect(
      (await createPin(servidor.ctx, usuario.user.id, pinInput('cobalto'), 'ip-prueba')).ok,
    ).toBe(true);
    expect(await ranking()).toEqual([{ word: 'cobalto', count: 1 }]);
    const lector = await servidor.connect();
    const evento = once(lector, 'words:top', 13000);
    cambiarEstado(servidor.ctx, 'pizarra', 'oculta', 'Prueba');
    expect((await evento)[0]).toEqual([]);
  }, 15000);
});
