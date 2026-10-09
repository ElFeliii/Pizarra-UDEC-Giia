import { firstIssue, preguntaInputSchema, type Ack, type Tema } from '@pizarra/shared';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getMeta, setMeta } from '../db/db';
import { fail, ok } from './errors';

const semillaSchema = z.object({
  version: z.number().int().positive(),
  temas: z.array(
    z.object({
      id: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(160),
      nombre: z.string().trim().min(3).max(200),
      grupo: z.string().nullable().default(null),
      campus: z.string().nullable().default(null),
      orden: z.number().int().nonnegative(),
    }),
  ),
});

/** Semilla y versión se guardan juntas; nunca se pisan las decisiones del moderador. */
export function seedTemas(ctx: AppContext, ruta: string, seccion: 'carreras' | 'faq'): number {
  const semilla = semillaSchema.parse(JSON.parse(readFileSync(ruta, 'utf8')));
  if (new Set(semilla.temas.map((tema) => tema.id)).size !== semilla.temas.length) {
    throw new Error(`La semilla de ${seccion} contiene identificadores repetidos.`);
  }
  return ctx.db.transaction(() => {
    const clave = `temas_${seccion}_version`;
    if (Number(getMeta(ctx.db, clave) ?? 0) >= semilla.version) return 0;
    const nuevos = ctx.repos.temas.agregarFaltantes(
      semilla.temas.map((tema) => ({
        ...tema,
        seccion,
        oculto: false,
      })),
    );
    setMeta(ctx.db, clave, String(semilla.version));
    return nuevos;
  })();
}

export function temasVisibles(ctx: AppContext): Tema[] {
  return ctx.repos.temas
    .listar()
    .filter((tema) => !tema.oculto && ctx.repos.secciones.get(tema.seccion)?.estado !== 'oculta');
}

export function agregarPregunta(ctx: AppContext, entrada: unknown, moderador: string): Ack<Tema> {
  const resultado = preguntaInputSchema.safeParse(entrada);
  if (!resultado.success) return fail('VALIDATION', firstIssue(resultado.error));
  if (!ctx.repos.secciones.get('faq'))
    return fail('NOT_FOUND', 'La sección de preguntas no existe.');
  const tema: Tema = {
    id: `faq-${randomUUID()}`,
    seccion: 'faq',
    nombre: resultado.data.nombre,
    grupo: null,
    campus: null,
    oculto: false,
    orden:
      Math.max(
        0,
        ...ctx.repos.temas
          .listar()
          .filter((t) => t.seccion === 'faq')
          .map((t) => t.orden),
      ) + 1,
  };
  ctx.db.transaction(() => {
    ctx.repos.temas.agregarFaltantes([tema]);
    ctx.repos.modLog.add({
      moderator: moderador,
      action: 'tema.agregar',
      detail: `${tema.id}: ${tema.nombre}`,
      now: ctx.now(),
    });
  })();
  ctx.broadcaster.temaActualizado(tema);
  return ok(tema);
}

export function cambiarPreguntaOculta(
  ctx: AppContext,
  id: string,
  oculto: boolean,
  moderador: string,
): Tema | undefined {
  if (ctx.repos.temas.obtener(id)?.seccion !== 'faq') return undefined;
  const tema = ctx.db.transaction(() => {
    const textos = ctx.repos.wordCounts.textosVisibles({ temaId: id });
    const cambiada = ctx.repos.temas.cambiarOculto(id, oculto, ctx.now());
    if (cambiada) {
      ctx.topWords.ajustarVisibilidad(textos, ctx.repos.wordCounts.textosVisibles({ temaId: id }));
    }
    if (cambiada)
      ctx.repos.modLog.add({
        moderator: moderador,
        action: 'tema.oculto',
        detail: `${id}: ${oculto}`,
        now: ctx.now(),
      });
    return cambiada;
  })();
  if (tema) ctx.broadcaster.temaActualizado(tema);
  return tema;
}
