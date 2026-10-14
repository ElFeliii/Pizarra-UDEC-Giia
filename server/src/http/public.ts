import { SECCION_DE_SUPERFICIE, SURFACES } from '@pizarra/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { createSession, findUserByToken, getThread, listPins, search } from '../services/content';
import { seccionesVisibles } from '../services/secciones';
import { temasVisibles } from '../services/temas';
import { sendAck, sendError } from './respond';
import { rateLimited } from '../services/errors';

/** Se pide por sección; `surface` se sigue aceptando y se traduce. */
function seccionDe(q: { seccion?: string; surface?: 'board' | 'map' }): string {
  return q.seccion ?? (q.surface ? SECCION_DE_SUPERFICIE[q.surface] : 'pizarra');
}

const pinsQuery = z.object({
  seccion: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  surface: z.enum(SURFACES).optional(),
  since: z.coerce.number().int().min(0).optional(),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });
const searchQuery = z.object({
  q: z.string().default(''),
  seccion: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  surface: z.enum(SURFACES).optional(),
});

export function publicRoutes(app: FastifyInstance, ctx: AppContext): void {
  // Se aplica sólo a lecturas de contenido: salud, archivos y Engine.IO conservan su acceso.
  const limitarLectura = async (req: FastifyRequest, reply: FastifyReply) => {
    const limite = ctx.limiters.lecturasHttp.take(req.ip);
    if (limite.ok) return;
    reply.header('retry-after', Math.max(1, Math.ceil(limite.retryAfterMs / 1000)));
    return sendAck(reply, rateLimited(limite.retryAfterMs));
  };
  app.get('/api/health', async () => ({ ok: true, time: ctx.now() }));

  app.get('/api/institutions', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return ctx.institutions.list;
  });

  /** Qué secciones existen y cuáles aceptan publicaciones ahora. */
  app.get('/api/secciones', async () => seccionesVisibles(ctx));
  app.get('/api/temas', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return temasVisibles(ctx);
  });

  app.post('/api/session', async (req, reply) => {
    return sendAck(reply, createSession(ctx, req.body, req.ip), 201);
  });

  /** Verifica un token guardado en el navegador. */
  app.get('/api/session', { preHandler: limitarLectura }, async (req, reply) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const user = findUserByToken(ctx, token);
    if (!user) return sendError(reply, 'NO_SESSION', 'Sesión no válida.');
    return {
      user: { id: user.id, name: user.name, institutionName: user.institutionName },
      silenced: user.silencedAt !== null,
    };
  });

  app.get('/api/pins', { preHandler: limitarLectura }, async (req, reply) => {
    const q = pinsQuery.safeParse(req.query);
    if (!q.success) return sendError(reply, 'VALIDATION', 'Parámetros no válidos.');
    reply.header('cache-control', 'no-store');
    return listPins(ctx, seccionDe(q.data), q.data.since);
  });

  app.get('/api/pins/:id/thread', { preHandler: limitarLectura }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(reply, 'VALIDATION', 'Id no válido.');
    const thread = getThread(ctx, p.data.id);
    if (!thread) return sendError(reply, 'NOT_FOUND', 'Ese pin ya no está disponible.');
    return thread;
  });

  app.get('/api/search', { preHandler: limitarLectura }, async (req, reply) => {
    const q = searchQuery.safeParse(req.query);
    if (!q.success) return sendError(reply, 'VALIDATION', 'Parámetros no válidos.');
    return search(ctx, q.data.q, seccionDe(q.data));
  });

  app.get('/api/words/top', async () => ctx.topWords.top());
}
