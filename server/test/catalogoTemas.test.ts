import type { Tema } from '@pizarra/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cambiarEstado } from '../src/services/secciones';
import { cambiarPreguntaOculta, temasVisibles } from '../src/services/temas';
import { startServer } from './helpers';

let servidor: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  servidor = await startServer();
});
afterEach(async () => {
  await servidor.close();
});

const pregunta = (id: string, nombre: string, orden: number, oculto = false): Tema => ({
  id,
  nombre,
  orden,
  oculto,
  seccion: 'faq',
  grupo: null,
  campus: null,
});

describe('catálogo público de temas sin consultas por cada resultado', () => {
  it('resuelve un catálogo grande sin volver a consultar la sección de cada tema', () => {
    const temas = Array.from({ length: 1000 }, (_, numero) =>
      pregunta(`faq-prueba-${numero}`, `Pregunta de prueba ${numero}`, numero),
    );
    servidor.ctx.repos.temas.agregarFaltantes(temas);
    const porSeccion = vi.spyOn(servidor.ctx.repos.secciones, 'get');
    const todos = vi.spyOn(servidor.ctx.repos.temas, 'listar');
    expect(temasVisibles(servidor.ctx)).toHaveLength(1092);
    expect(porSeccion.mock.calls.length).toBe(0);
    expect(todos.mock.calls.length).toBe(0);
  });

  it('ocultar y restaurar temas o secciones se refleja en la siguiente lectura sin caché', () => {
    cambiarEstado(servidor.ctx, 'carreras', 'oculta', 'Mod Test');
    const primera = pregunta('faq-primera', 'Primera pregunta pública', 1);
    const segunda = pregunta('faq-segunda', 'Segunda pregunta pública', 2);
    const privada = pregunta('faq-privada', 'Título privado que no se debe entregar', 0, true);
    servidor.ctx.repos.temas.agregarFaltantes([segunda, privada, primera]);
    expect(temasVisibles(servidor.ctx)).toEqual([primera, segunda]);
    cambiarPreguntaOculta(servidor.ctx, primera.id, true, 'Mod Test');
    expect(temasVisibles(servidor.ctx)).toEqual([segunda]);
    cambiarEstado(servidor.ctx, 'faq', 'oculta', 'Mod Test');
    expect(temasVisibles(servidor.ctx)).toEqual([]);
    cambiarEstado(servidor.ctx, 'faq', 'solo_lectura', 'Mod Test');
    expect(temasVisibles(servidor.ctx)).toEqual([segunda]);
    cambiarPreguntaOculta(servidor.ctx, primera.id, false, 'Mod Test');
    expect(temasVisibles(servidor.ctx)).toEqual([primera, segunda]);
  });

  it('conserva datos y orden del catálogo para secciones abiertas y solo de lectura', () => {
    const antes = temasVisibles(servidor.ctx);
    expect(
      antes.every((tema) => tema.seccion === 'carreras' && !!tema.grupo && !!tema.campus),
    ).toBe(true);
    cambiarEstado(servidor.ctx, 'carreras', 'solo_lectura', 'Mod Test');
    expect(temasVisibles(servidor.ctx)).toEqual(antes);
    const oculto = antes[0]!;
    servidor.ctx.repos.temas.cambiarOculto(oculto.id, true, Date.now());
    expect(temasVisibles(servidor.ctx)).toEqual(antes.slice(1));
    servidor.ctx.repos.temas.cambiarOculto(oculto.id, false, Date.now());
    expect(temasVisibles(servidor.ctx)).toEqual(antes);
  });
});
