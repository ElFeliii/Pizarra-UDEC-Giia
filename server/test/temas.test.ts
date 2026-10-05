import type { PinSummary, Tema, Thread } from '@pizarra/shared';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMeta } from '../src/db/db';
import { seedTemas } from '../src/services/temas';
import { once, startServer } from './helpers';

let servidor: Awaited<ReturnType<typeof startServer>>;
let cookie: string;
beforeEach(async () => {
  servidor = await startServer();
  cookie = await servidor.modLogin();
});
afterEach(async () => {
  await servidor.close();
});

async function pregunta(nombre = '¿Qué consejo darías para el primer año?'): Promise<Tema> {
  const respuesta = await servidor.app.inject({
    method: 'POST',
    url: '/api/admin/secciones/faq/temas',
    headers: { cookie },
    payload: { nombre },
  });
  expect(respuesta.statusCode).toBe(201);
  return respuesta.json() as Tema;
}
async function usuario() {
  const { token } = await servidor.newUser();
  return servidor.connect(token);
}
const nota = (seccion: string, temaId?: string, text = 'Un consejo para conocer esta carrera') => ({
  seccion,
  temaId,
  color: 'verde' as const,
  text,
});

describe('temas de Carreras y preguntas frecuentes', () => {
  it('carga las carreras con campus y facultad; FAQ empieza sin preguntas', async () => {
    const respuesta = await servidor.app.inject({ method: 'GET', url: '/api/temas' });
    expect(respuesta.statusCode).toBe(200);
    const temas = respuesta.json() as Tema[];
    expect(temas).toHaveLength(92);
    expect(temas.every((t) => t.seccion === 'carreras' && !!t.grupo && !!t.campus)).toBe(true);
  });

  it('solo moderadores pueden agregar preguntas; valida y registra la acción', async () => {
    const ruta = '/api/admin/secciones/faq/temas';
    expect(
      (
        await servidor.app.inject({
          method: 'POST',
          url: ruta,
          payload: { nombre: 'Pregunta válida' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await servidor.app.inject({
          method: 'POST',
          url: ruta,
          headers: { cookie },
          payload: { nombre: ' ' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await servidor.app.inject({
          method: 'POST',
          url: ruta,
          headers: { cookie },
          payload: { nombre: 'a'.repeat(201) },
        })
      ).statusCode,
    ).toBe(400);
    const tema = await pregunta();
    expect(tema).toMatchObject({ seccion: 'faq', oculto: false, grupo: null, campus: null });
    expect(
      servidor.ctx.db.prepare("SELECT action FROM mod_log WHERE action = 'tema.agregar'").get(),
    ).toEqual({ action: 'tema.agregar' });
    expect((await servidor.app.inject({ method: 'GET', url: '/api/temas' })).json()).toContainEqual(
      tema,
    );
  });

  it('la pregunta nueva llega a un visitante sin sesión en tiempo real', async () => {
    const visitante = await servidor.connect();
    const aviso = once(visitante, 'tema:actualizado');
    const tema = await pregunta();
    expect((await aviso)[0]).toEqual(tema);
  });

  it('exige un tema de la misma sección y conserva el muro sin temas', async () => {
    const socket = await usuario();
    const faq = await pregunta();
    const carrera = servidor.ctx.repos.temas.listar().find((t) => t.seccion === 'carreras')!;
    for (const entrada of [
      nota('carreras'),
      nota('faq'),
      nota('carreras', faq.id),
      nota('faq', carrera.id),
      nota('faq', 'no-existe'),
    ]) {
      const respuesta = await socket.emitWithAck('nota:create', entrada);
      expect(respuesta.ok).toBe(false);
      if (!respuesta.ok) expect(respuesta.error.code).toBe('VALIDATION');
    }
    const respuesta = await socket.emitWithAck('nota:create', nota('consejos'));
    expect(respuesta.ok).toBe(true);
    if (respuesta.ok) expect(respuesta.data.temaId).toBeNull();
  });

  it('las notas viajan con su tema; reutilizan filtro, búsqueda e hilos', async () => {
    const tema = await pregunta();
    const socket = await usuario();
    const bloqueada = await socket.emitWithAck(
      'nota:create',
      nota('faq', tema.id, 'Eres un imbecil'),
    );
    expect(bloqueada.ok).toBe(false);
    if (!bloqueada.ok) expect(bloqueada.error.code).toBe('CENSORED');
    const respuesta = await socket.emitWithAck(
      'nota:create',
      nota('faq', tema.id, 'Consejo universitario sobre bibliotecas'),
    );
    expect(respuesta.ok).toBe(true);
    if (!respuesta.ok) return;
    expect(respuesta.data.temaId).toBe(tema.id);
    const comentario = await socket.emitWithAck('reply:create', {
      pinId: respuesta.data.id,
      text: 'Gracias por compartir tu experiencia',
    });
    expect(comentario.ok).toBe(true);
    const hilo = (
      await servidor.app.inject({ method: 'GET', url: `/api/pins/${respuesta.data.id}/thread` })
    ).json() as Thread;
    expect(hilo.pin.temaId).toBe(tema.id);
    expect(hilo.replies).toHaveLength(1);
    expect(
      (
        await servidor.app.inject({ method: 'GET', url: '/api/search?seccion=faq&q=bibliotecas' })
      ).json(),
    ).toHaveLength(1);
    const pines = (
      await servidor.app.inject({ method: 'GET', url: '/api/pins?seccion=faq' })
    ).json() as { pins: PinSummary[] };
    expect(pines.pins.map((p) => p.temaId)).toEqual([tema.id]);
  });

  it.each(['carreras', 'faq'])('cerrar %s impide publicar notas y comentarios', async (seccion) => {
    const tema = seccion === 'faq' ? await pregunta() : servidor.ctx.repos.temas.listar()[0]!;
    const socket = await usuario();
    const publicada = await socket.emitWithAck('nota:create', nota(seccion, tema.id));
    expect(publicada.ok).toBe(true);
    await servidor.app.inject({
      method: 'POST',
      url: `/api/admin/secciones/${seccion}`,
      headers: { cookie },
      payload: { estado: 'solo_lectura' },
    });
    const tardia = await socket.emitWithAck(
      'nota:create',
      nota(seccion, tema.id, 'Otra nota después del cierre'),
    );
    expect(tardia).toMatchObject({ ok: false, error: { code: 'SECCION_CERRADA' } });
    if (publicada.ok)
      expect(
        await socket.emitWithAck('reply:create', {
          pinId: publicada.data.id,
          text: 'Un comentario tardío',
        }),
      ).toMatchObject({ ok: false, error: { code: 'SECCION_CERRADA' } });
    expect(
      (await servidor.app.inject({ method: 'GET', url: `/api/pins?seccion=${seccion}` })).json()
        .pins,
    ).toHaveLength(1);
  });

  it('ocultar una pregunta retira notas, búsqueda e hilo y bloquea nuevas respuestas', async () => {
    const tema = await pregunta();
    const socket = await usuario();
    const creada = await socket.emitWithAck(
      'nota:create',
      nota('faq', tema.id, 'Orientación sobre las bibliotecas del campus'),
    );
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;
    const desde = creada.data.updatedAt;
    const ocultar = await servidor.app.inject({
      method: 'POST',
      url: `/api/admin/temas/${tema.id}/estado`,
      headers: { cookie },
      payload: { oculto: true },
    });
    expect(ocultar.statusCode).toBe(200);
    expect(
      (await servidor.app.inject({ method: 'GET', url: '/api/temas' })).json(),
    ).not.toContainEqual(expect.objectContaining({ id: tema.id }));
    expect(
      (await servidor.app.inject({ method: 'GET', url: '/api/pins?seccion=faq' })).json().pins,
    ).toEqual([]);
    expect(
      (
        await servidor.app.inject({ method: 'GET', url: `/api/pins?seccion=faq&since=${desde}` })
      ).json().removed,
    ).toContain(creada.data.id);
    expect(
      (await servidor.app.inject({ method: 'GET', url: `/api/pins/${creada.data.id}/thread` }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await servidor.app.inject({ method: 'GET', url: '/api/search?seccion=faq&q=bibliotecas' })
      ).json(),
    ).toEqual([]);
    expect(await socket.emitWithAck('nota:create', nota('faq', tema.id))).toMatchObject({
      ok: false,
    });
    expect(
      await socket.emitWithAck('reply:create', {
        pinId: creada.data.id,
        text: 'Respuesta a una pregunta oculta',
      }),
    ).toMatchObject({ ok: false });
    await servidor.app.inject({
      method: 'POST',
      url: `/api/admin/temas/${tema.id}/estado`,
      headers: { cookie },
      payload: { oculto: false },
    });
    expect(
      (await servidor.app.inject({ method: 'GET', url: '/api/pins?seccion=faq' })).json().pins,
    ).toHaveLength(1);
  });

  it('los reportes y la moderación humana funcionan sobre las notas del tema', async () => {
    const tema = await pregunta();
    const socket = await usuario();
    const creada = await socket.emitWithAck('nota:create', nota('faq', tema.id));
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;
    const otro = await usuario();
    expect(
      await otro.emitWithAck('report:create', { targetType: 'pin', targetId: creada.data.id }),
    ).toMatchObject({ ok: true });
    const reportes = (
      await servidor.app.inject({ method: 'GET', url: '/api/admin/reports', headers: { cookie } })
    ).json();
    expect(reportes).toContainEqual(expect.objectContaining({ id: creada.data.id }));
    await servidor.app.inject({
      method: 'POST',
      url: `/api/admin/content/pin/${creada.data.id}/hide`,
      headers: { cookie },
    });
    expect(
      (await servidor.app.inject({ method: 'GET', url: '/api/pins?seccion=faq' })).json().pins,
    ).toEqual([]);
  });

  it('exporta el contexto de la carrera junto a la nota', async () => {
    const carrera = servidor.ctx.repos.temas
      .listar()
      .find((t) => t.nombre === 'Ingeniería Civil Informática')!;
    const socket = await usuario();
    expect(await socket.emitWithAck('nota:create', nota('carreras', carrera.id))).toMatchObject({
      ok: true,
    });
    const respuesta = await servidor.app.inject({
      method: 'GET',
      url: '/api/admin/export/pins.csv',
      headers: { cookie },
    });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.body).toContain('Ingeniería Civil Informática');
    expect(respuesta.body).toContain('Facultad de Ingeniería');
    expect(respuesta.body).toContain('Concepción');
  });

  it('las semillas son versionadas y respetan preguntas agregadas y temas ocultos', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'pizarra-temas-'));
    try {
      const ruta = join(carpeta, 'faq.json');
      const original = await pregunta();
      servidor.ctx.repos.temas.cambiarOculto(original.id, true, Date.now());
      writeFileSync(
        ruta,
        JSON.stringify({
          version: 2,
          temas: [
            { id: original.id, nombre: 'No debe reemplazar el nombre', orden: 0 },
            { id: 'faq-semilla', nombre: 'Una pregunta nueva de la semilla', orden: 4 },
          ],
        }),
      );
      expect(seedTemas(servidor.ctx, ruta, 'faq')).toBe(1);
      expect(seedTemas(servidor.ctx, ruta, 'faq')).toBe(0);
      expect(servidor.ctx.repos.temas.obtener(original.id)).toMatchObject({
        nombre: original.nombre,
        oculto: true,
      });
      expect(getMeta(servidor.ctx.db, 'temas_faq_version')).toBe('2');
      writeFileSync(
        ruta,
        JSON.stringify({
          version: 3,
          temas: [
            { id: 'faq-repetida', nombre: 'Pregunta repetida', orden: 0 },
            { id: 'faq-repetida', nombre: 'Otra pregunta repetida', orden: 1 },
          ],
        }),
      );
      expect(() => seedTemas(servidor.ctx, ruta, 'faq')).toThrow(/repetidos/);
      expect(getMeta(servidor.ctx.db, 'temas_faq_version')).toBe('2');
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
