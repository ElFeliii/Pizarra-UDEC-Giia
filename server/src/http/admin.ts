import {
  bannedWordInputSchema,
  ESTADOS_SECCION,
  firstIssue,
  modLoginSchema,
  type ModStats,
} from '@pizarra/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import {
  addBannedWord,
  applyBannedWord,
  dismissReports,
  moderatorHide,
  removeBannedWord,
  restoreContent,
  setSilenced,
} from '../services/moderation';
import {
  aplicarPreset,
  cambiarEstado,
  listarSecciones,
  PRESET_IDS,
  PRESETS,
} from '../services/secciones';
import { agregarPregunta, cambiarPreguntaOculta } from '../services/temas';
import { authenticateModerator, MOD_COOKIE, MOD_SESSION_TTL_MS, type ModSessions } from './auth';
import { formatDate, toCsv, type CsvColumn } from './csv';
import { sendAck, sendError } from './respond';

declare module 'fastify' {
  interface FastifyRequest {
    moderator?: string;
  }
}

const contentParams = z.object({
  type: z.enum(['pin', 'reply']),
  id: z.coerce.number().int().positive(),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });
const usersQuery = z.object({
  q: z.string().max(60).optional(),
  silenced: z.enum(['0', '1']).optional(),
});
const feedQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

const yesNo = (v: unknown) => (v ? 'sí' : '');

const EXPORTS: Record<
  string,
  { columns: CsvColumn[]; rows: (ctx: AppContext) => Record<string, unknown>[] }
> = {
  pins: {
    rows: (ctx) => ctx.repos.mod.exportPins(),
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'createdAt', header: 'Fecha', format: formatDate },
      { key: 'author', header: 'Autor' },
      { key: 'institution', header: 'Institución' },
      { key: 'seccion', header: 'Sección' },
      { key: 'temaId', header: 'ID tema' },
      { key: 'tema', header: 'Tema' },
      { key: 'grupo', header: 'Facultad o escuela' },
      { key: 'campus', header: 'Campus' },
      { key: 'color', header: 'Color' },
      { key: 'text', header: 'Texto' },
      { key: 'replies', header: 'Respuestas' },
      { key: 'x', header: 'X' },
      { key: 'y', header: 'Y' },
      { key: 'hiddenAt', header: 'Oculto', format: yesNo },
      { key: 'hiddenReason', header: 'Motivo' },
      { key: 'hiddenBy', header: 'Ocultado por' },
    ],
  },
  replies: {
    rows: (ctx) => ctx.repos.mod.exportReplies(),
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'pinId', header: 'ID pin' },
      { key: 'createdAt', header: 'Fecha', format: formatDate },
      { key: 'author', header: 'Autor' },
      { key: 'institution', header: 'Institución' },
      { key: 'text', header: 'Texto' },
      { key: 'hiddenAt', header: 'Oculto', format: yesNo },
      { key: 'hiddenReason', header: 'Motivo' },
      { key: 'hiddenBy', header: 'Ocultado por' },
    ],
  },
  users: {
    rows: (ctx) => ctx.repos.mod.exportUsers(),
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'createdAt', header: 'Fecha ingreso', format: formatDate },
      { key: 'name', header: 'Nombre' },
      { key: 'institution', header: 'Institución' },
      { key: 'pins', header: 'Pines' },
      { key: 'replies', header: 'Respuestas' },
      { key: 'silencedAt', header: 'Silenciado', format: yesNo },
    ],
  },
};

export interface AdminDeps {
  ctx: AppContext;
  modSessions: ModSessions;
}

function readSid(app: FastifyInstance, req: FastifyRequest): string | undefined {
  const raw = req.cookies[MOD_COOKIE];
  if (!raw) return undefined;
  const res = app.unsignCookie(raw);
  return res.valid && res.value ? res.value : undefined;
}

export async function adminRoutes(app: FastifyInstance, { ctx, modSessions }: AdminDeps) {
  // ---------- Sesión ----------

  app.post('/api/admin/login', async (req, reply) => {
    const rl = ctx.limiters.modLogin.take(req.ip);
    if (!rl.ok) return sendError(reply, 'RATE_LIMITED', 'Demasiados intentos. Espera un minuto.');
    const body = modLoginSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 'VALIDATION', firstIssue(body.error));
    const name = authenticateModerator(
      ctx.config.moderators,
      ctx.config.modPassword,
      body.data.moderatorName,
      body.data.password,
    );
    if (!name) return sendError(reply, 'UNAUTHORIZED', 'Nombre o contraseña incorrectos.');
    const sid = modSessions.create(name);
    reply.setCookie(MOD_COOKIE, sid, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: 'auto',
      signed: true,
      maxAge: MOD_SESSION_TTL_MS / 1000,
    });
    ctx.repos.modLog.add({ moderator: name, action: 'login', now: ctx.now() });
    return { name };
  });

  app.post('/api/admin/logout', async (req, reply) => {
    modSessions.destroy(readSid(app, req));
    reply.clearCookie(MOD_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/admin/me', async (req, reply) => {
    const name = modSessions.get(readSid(app, req));
    if (!name) return sendError(reply, 'UNAUTHORIZED', 'No has iniciado sesión.');
    return { name };
  });

  // ---------- Rutas protegidas ----------

  await app.register(async (admin) => {
    admin.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
      const name = modSessions.get(readSid(app, req));
      if (!name) return sendError(reply, 'UNAUTHORIZED', 'No has iniciado sesión.');
      req.moderator = name;
    });

    admin.get('/api/admin/reports', async () => ctx.repos.reports.queue());

    admin.get('/api/admin/feed', async (req, reply) => {
      const consulta = feedQuery.safeParse(req.query);
      if (!consulta.success) return sendError(reply, 'VALIDATION', 'Límite no válido.');
      const { limit } = consulta.data;
      return ctx.repos.mod.feed(limit);
    });

    admin.post('/api/admin/content/:type/:id/:action', async (req, reply) => {
      const p = contentParams.safeParse(req.params);
      const action = (req.params as { action?: string }).action;
      if (!p.success) return sendError(reply, 'VALIDATION', 'Parámetros no válidos.');
      const { type, id } = p.data;
      const mod = req.moderator!;
      switch (action) {
        case 'hide':
          return { changed: moderatorHide(ctx, type, id, mod) };
        case 'restore':
          return { changed: restoreContent(ctx, type, id, mod) };
        case 'dismiss':
          return { changed: dismissReports(ctx, type, id, mod) > 0 };
        default:
          return sendError(reply, 'NOT_FOUND', 'Acción desconocida.');
      }
    });

    admin.get('/api/admin/users', async (req, reply) => {
      const consulta = usersQuery.safeParse(req.query);
      if (!consulta.success) return sendError(reply, 'VALIDATION', 'Parámetros no válidos.');
      const q = consulta.data;
      return ctx.repos.users.list({
        q: q.q?.trim() || undefined,
        silencedOnly: q.silenced === '1',
      });
    });

    admin.post('/api/admin/users/:id/:action', async (req, reply) => {
      const p = idParam.safeParse(req.params);
      const action = (req.params as { action?: string }).action;
      if (!p.success || (action !== 'silence' && action !== 'unsilence')) {
        return sendError(reply, 'VALIDATION', 'Parámetros no válidos.');
      }
      return { changed: setSilenced(ctx, p.data.id, action === 'silence', req.moderator!) };
    });

    // ---------- Secciones: los dos momentos del evento ----------

    admin.get('/api/admin/secciones', async () => ({
      secciones: listarSecciones(ctx),
      presets: PRESET_IDS.map((id) => ({ id, ...PRESETS[id] })),
    }));

    admin.post('/api/admin/secciones/:id', async (req, reply) => {
      const p = z.object({ id: z.string().regex(/^[a-z0-9-]+$/) }).safeParse(req.params);
      const body = z.object({ estado: z.enum(ESTADOS_SECCION) }).safeParse(req.body);
      if (!p.success || !body.success) return sendError(reply, 'VALIDATION', 'Datos no válidos.');
      const seccion = cambiarEstado(ctx, p.data.id, body.data.estado, req.moderator!);
      // Sin cambio puede ser porque no existe o porque ya estaba así; para el panel da igual.
      return seccion ?? sendError(reply, 'NOT_FOUND', 'Esa sección no existe o ya estaba así.');
    });

    admin.post('/api/admin/secciones/preset/:preset', async (req, reply) => {
      const p = z.object({ preset: z.enum(PRESET_IDS) }).safeParse(req.params);
      if (!p.success) return sendError(reply, 'VALIDATION', 'Ese momento no existe.');
      return { cambiadas: aplicarPreset(ctx, p.data.preset, req.moderator!) };
    });

    admin.get('/api/admin/temas', async () => ctx.repos.temas.listar());

    admin.post('/api/admin/secciones/faq/temas', async (req, reply) =>
      sendAck(reply, agregarPregunta(ctx, req.body, req.moderator!), 201),
    );

    admin.post('/api/admin/temas/:id/estado', async (req, reply) => {
      const parametros = z
        .object({
          id: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(160),
        })
        .safeParse(req.params);
      const entrada = z.object({ oculto: z.boolean() }).safeParse(req.body);
      if (!parametros.success || !entrada.success)
        return sendError(reply, 'VALIDATION', 'Datos no válidos.');
      return (
        cambiarPreguntaOculta(ctx, parametros.data.id, entrada.data.oculto, req.moderator!) ??
        sendError(reply, 'NOT_FOUND', 'Esa pregunta no existe.')
      );
    });

    admin.get('/api/admin/words', async () => ctx.repos.bannedWords.list());

    admin.post('/api/admin/words', async (req, reply) => {
      const body = bannedWordInputSchema.safeParse(req.body);
      if (!body.success) return sendError(reply, 'VALIDATION', firstIssue(body.error));
      return sendAck(
        reply,
        addBannedWord(ctx, body.data.term, body.data.mode, req.moderator!),
        201,
      );
    });

    admin.delete('/api/admin/words/:id', async (req, reply) => {
      const p = idParam.safeParse(req.params);
      if (!p.success) return sendError(reply, 'VALIDATION', 'Id no válido.');
      if (!removeBannedWord(ctx, p.data.id, req.moderator!)) {
        return sendError(reply, 'NOT_FOUND', 'Esa palabra no existe.');
      }
      return { ok: true };
    });

    admin.post('/api/admin/words/:id/apply', async (req, reply) => {
      const p = idParam.safeParse(req.params);
      if (!p.success) return sendError(reply, 'VALIDATION', 'Id no válido.');
      const res = applyBannedWord(ctx, p.data.id, req.moderator!);
      if (!res) return sendError(reply, 'NOT_FOUND', 'Esa palabra no existe.');
      return res;
    });

    admin.get('/api/admin/stats', async (): Promise<ModStats> => ({
      ...ctx.repos.mod.stats(),
      pendingReports: ctx.repos.reports.pendingTargets(),
      online: ctx.online(),
    }));

    admin.get('/api/admin/export/:file', async (req, reply) => {
      const file = (req.params as { file?: string }).file ?? '';
      const kind = file.replace(/\.csv$/, '');
      const spec = EXPORTS[kind];
      if (!spec) return sendError(reply, 'NOT_FOUND', 'Exportación desconocida.');
      const stamp = formatDate(ctx.now()).replace(/[: ]/g, '-');
      reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="pizarra-${kind}-${stamp}.csv"`)
        .header('cache-control', 'no-store');
      return toCsv(spec.columns, spec.rows(ctx));
    });
  });
}
