import {
  LIMITS,
  ESPACIO_MODERACION,
  invadeModeracion,
  OTHER_INSTITUTION_ID,
  firstIssue,
  pinInputSchema,
  notaInputSchema,
  replyInputSchema,
  sessionInputSchema,
  vistaInputSchema,
  type Ack,
  type PinSummary,
  type PinsSnapshot,
  type PublicUser,
  type Reply,
  type SearchHit,
  type Thread,
} from '@pizarra/shared';
import { createHash, randomBytes } from 'node:crypto';
import type { AppContext } from '../context';
import { toDetail, toSummary } from '../db/repos/pins';
import { toReply } from '../db/repos/replies';
import type { UserRow } from '../db/repos/users';
import { checkContentRules } from '../moderation/contentRules';
import { incitesHate } from '../moderation/hate';
import { sanitizeText } from '../moderation/normalize';
import { fail, ok, rateLimited, type Fail } from './errors';
import { seccionAbierta, seccionDeSuperficie } from './secciones';

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function findUserByToken(ctx: AppContext, token: unknown): UserRow | undefined {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return undefined;
  return ctx.repos.users.findByTokenHash(hashToken(token));
}

/**
 * Filtro común para todo texto que escribe un usuario: limpia, aplica reglas (links, datos
 * personales) y la lista de palabras prohibidas.
 */
function screenText(
  ctx: AppContext,
  raw: string,
  minLength: number,
): { ok: true; text: string } | Fail {
  const text = sanitizeText(raw);
  if (text.length < minLength) return fail('VALIDATION', 'El texto está vacío o es muy corto.');
  const rule = checkContentRules(text);
  if (rule) return fail(rule);
  if (ctx.censor.isBlocked(text) || incitesHate(text)) return fail('CENSORED');
  return { ok: true, text };
}

/**
 * Un texto rechazado por el filtro devuelve su motivo, salvo que el usuario acumule demasiados
 * rechazos seguidos (está probando variantes para evadirlo): ahí debe esperar.
 */
function rejected(ctx: AppContext, userId: number, failure: Fail): Fail {
  const rl = ctx.limiters.rejected.take(`u${userId}`);
  return rl.ok ? failure : rateLimited(rl.retryAfterMs);
}

/**
 * Nadie publica en una sección cerrada. Se comprueba en el servidor aunque el cliente ya
 * esconda el botón: el estado puede haber cambiado hace un segundo, o el cliente puede mentir.
 */
function seccionEscribible(ctx: AppContext, seccion: string): Fail | null {
  return seccionAbierta(ctx, seccion) ? null : fail('SECCION_CERRADA');
}

export function notaVisible(
  ctx: AppContext,
  pin: { seccion: string; temaId: string | null; hiddenAt: number | null },
): boolean {
  return (
    pin.hiddenAt === null &&
    ctx.repos.secciones.get(pin.seccion)?.estado !== 'oculta' &&
    (!pin.temaId || ctx.repos.temas.obtener(pin.temaId)?.oculto === false)
  );
}

function activeUser(ctx: AppContext, userId: number): { ok: true; user: UserRow } | Fail {
  const user = ctx.repos.users.findById(userId);
  if (!user) return fail('NO_SESSION');
  if (user.silencedAt !== null) return fail('SILENCED');
  return { ok: true, user };
}

// ---------------------------------------------------------------------------

export function createSession(
  ctx: AppContext,
  input: unknown,
  ip: string,
): Ack<{ token: string; user: PublicUser }> {
  const rl = ctx.limiters.session.take(ip);
  if (!rl.ok) return rateLimited(rl.retryAfterMs);

  const parsed = sessionInputSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', firstIssue(parsed.error));
  const { name, institutionId, institutionOther } = parsed.data;

  const institution = ctx.institutions.get(institutionId);
  if (!institution) return fail('VALIDATION', 'Institución no válida.');

  const cleanName = screenText(ctx, name, LIMITS.name.min);
  if (!cleanName.ok) {
    return cleanName.error.code === 'CENSORED'
      ? fail('CENSORED', 'Ese nombre contiene palabras no permitidas.')
      : cleanName;
  }

  let institutionName = institution.name;
  if (institution.id === OTHER_INSTITUTION_ID) {
    const other = screenText(ctx, institutionOther ?? '', LIMITS.institutionOther.min);
    if (!other.ok) {
      return other.error.code === 'CENSORED'
        ? fail('CENSORED', 'El nombre de la institución contiene palabras no permitidas.')
        : other;
    }
    institutionName = other.text;
  }

  const token = randomBytes(32).toString('base64url');
  const user = ctx.repos.users.create({
    tokenHash: hashToken(token),
    name: cleanName.text,
    institutionId: institution.id,
    institutionName,
    ip,
    createdAt: ctx.now(),
  });
  return ok({ token, user: { id: user.id, name: user.name, institutionName } });
}

export function createPin(
  ctx: AppContext,
  userId: number,
  input: unknown,
  ip: string,
  autorModerador: string | null = null,
): Ack<PinSummary> {
  const active = activeUser(ctx, userId);
  if (!active.ok) return active;
  const { user } = active;

  const parsed = pinInputSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', firstIssue(parsed.error));

  const seccion = seccionDeSuperficie(parsed.data.surface);
  const cerrada = seccionEscribible(ctx, seccion);
  if (cerrada) return cerrada;
  if (invadeModeracion(parsed.data, ctx.repos.pins.listVisible(seccion))) {
    return fail('VALIDATION', ESPACIO_MODERACION);
  }

  const screened = screenText(ctx, parsed.data.text, LIMITS.pin.min);
  if (!screened.ok) return rejected(ctx, user.id, screened);
  const text = screened.text;

  const now = ctx.now();
  if (ctx.repos.pins.hasRecentDuplicate(user.id, text, now - DUPLICATE_WINDOW_MS)) {
    return fail('DUPLICATE');
  }

  // El límite de publicación solo cuenta lo que realmente se publica.
  const rl = ctx.limiters.pin.take(`u${user.id}`, ip);
  if (!rl.ok) return rateLimited(rl.retryAfterMs);

  const { repos } = ctx;
  const id = ctx.db.transaction(() => {
    const pinId = repos.pins.insert({
      ...parsed.data,
      seccion,
      text,
      autorModerador,
      userId: user.id,
      now,
    });
    repos.search.index({
      kind: 'pin',
      refId: pinId,
      pinId,
      text,
      author: autorModerador ?? user.name,
      institution: user.institutionName,
    });
    ctx.topWords.apply(text, 1);
    return pinId;
  })();

  const summary = toSummary(repos.pins.get(id)!);
  ctx.broadcaster.pinCreated(summary);
  const item = repos.mod.item('pin', id);
  if (item) ctx.broadcaster.modFeed(item);
  return ok(summary);
}

/**
 * Publica una nota en un muro. Comparte todo con `createPin` —filtro, límites, duplicados,
 * índice de búsqueda y palabras repetidas— y solo cambia en que acá la nota no tiene lugar.
 */
export function createNota(
  ctx: AppContext,
  userId: number,
  input: unknown,
  ip: string,
  autorModerador: string | null = null,
): Ack<PinSummary> {
  const active = activeUser(ctx, userId);
  if (!active.ok) return active;
  const { user } = active;

  const parsed = notaInputSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', firstIssue(parsed.error));

  const seccion = ctx.repos.secciones.get(parsed.data.seccion);
  if (!seccion || seccion.tipo !== 'muro') return fail('NOT_FOUND', 'Esa sección no existe.');
  const cerrada = seccionEscribible(ctx, seccion.id);
  if (cerrada) return cerrada;
  const temaId = parsed.data.temaId ?? null;
  const tema = temaId ? ctx.repos.temas.obtener(temaId) : undefined;
  if (
    (temaId && (!tema || tema.oculto || tema.seccion !== seccion.id)) ||
    (!temaId && (seccion.id === 'carreras' || seccion.id === 'faq'))
  ) {
    return fail('VALIDATION', 'Elige un tema disponible de esta sección.');
  }

  const screened = screenText(ctx, parsed.data.text, LIMITS.pin.min);
  if (!screened.ok) return rejected(ctx, user.id, screened);
  const text = screened.text;

  const now = ctx.now();
  if (ctx.repos.pins.hasRecentDuplicate(user.id, text, now - DUPLICATE_WINDOW_MS)) {
    return fail('DUPLICATE');
  }

  const rl = ctx.limiters.pin.take(`u${user.id}`, ip);
  if (!rl.ok) return rateLimited(rl.retryAfterMs);

  const { repos } = ctx;
  const id = ctx.db.transaction(() => {
    // En un muro no hay coordenadas; `surface` queda en 'board' por compatibilidad del esquema.
    const pinId = repos.pins.insert({
      seccion: seccion.id,
      temaId,
      autorModerador,
      surface: 'board',
      x: 0,
      y: 0,
      color: parsed.data.color,
      text,
      userId: user.id,
      now,
    });
    repos.search.index({
      kind: 'pin',
      refId: pinId,
      pinId,
      text,
      author: autorModerador ?? user.name,
      institution: user.institutionName,
    });
    ctx.topWords.apply(text, 1);
    return pinId;
  })();

  const summary = toSummary(repos.pins.get(id)!);
  ctx.broadcaster.pinCreated(summary);
  const item = repos.mod.item('pin', id);
  if (item) ctx.broadcaster.modFeed(item);
  return ok(summary);
}

export function createReply(
  ctx: AppContext,
  userId: number,
  input: unknown,
  ip: string,
  autorModerador: string | null = null,
): Ack<Reply> {
  const active = activeUser(ctx, userId);
  if (!active.ok) return active;
  const { user } = active;

  const parsed = replyInputSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', firstIssue(parsed.error));
  const { pinId } = parsed.data;

  const pin = ctx.repos.pins.get(pinId);
  if (!pin || !notaVisible(ctx, pin)) return fail('NOT_FOUND');

  const cerrada = seccionEscribible(ctx, pin.seccion);
  if (cerrada) return cerrada;

  const screened = screenText(ctx, parsed.data.text, LIMITS.reply.min);
  if (!screened.ok) return rejected(ctx, user.id, screened);
  const text = screened.text;

  const now = ctx.now();
  if (ctx.repos.replies.hasRecentDuplicate(user.id, pinId, text, now - DUPLICATE_WINDOW_MS)) {
    return fail('DUPLICATE');
  }

  const rl = ctx.limiters.reply.take(`u${user.id}`, ip);
  if (!rl.ok) return rateLimited(rl.retryAfterMs);

  const { repos } = ctx;
  const { id, replyCount } = ctx.db.transaction(() => {
    const replyId = repos.replies.insert({ pinId, text, autorModerador, userId: user.id, now });
    const count = repos.pins.bumpReplyCount(pinId, 1, now);
    repos.search.index({
      kind: 'reply',
      refId: replyId,
      pinId,
      text,
      author: autorModerador ?? user.name,
      institution: user.institutionName,
    });
    ctx.topWords.apply(text, 1);
    return { id: replyId, replyCount: count };
  })();

  const reply = toReply(repos.replies.get(id)!);
  ctx.broadcaster.replyCreated(reply);
  ctx.broadcaster.replyCountChanged(pinId, replyCount);
  const item = repos.mod.item('reply', id);
  if (item) ctx.broadcaster.modFeed(item);
  return ok(reply);
}

/**
 * Cuenta que alguien abrió una nota. No necesita sesión: el identificador anónimo del navegador
 * basta para no contar dos veces a la misma persona, y así una nota crece aunque la miren
 * quienes todavía no dieron su nombre.
 *
 * Es silencioso a propósito: si algo no calza, no pasa nada. Una visita perdida no le importa a
 * nadie y no vale la pena molestar a quien está leyendo.
 */
export function registrarVista(ctx: AppContext, input: unknown, ip: string): void {
  if (!ctx.limiters.vista.take(ip).ok) return;
  const parsed = vistaInputSchema.safeParse(input);
  if (!parsed.success) return;

  const pin = ctx.repos.pins.get(parsed.data.pinId);
  if (!pin || !notaVisible(ctx, pin)) return;

  const vistas = ctx.repos.pins.registrarVista(pin.id, parsed.data.visitante, ctx.now());
  if (vistas !== null) ctx.broadcaster.vistasChanged(pin.id, vistas);
}

// ---------------------------------------------------------------------------
// Lecturas públicas

export function listPins(ctx: AppContext, seccion: string, since?: number): PinsSnapshot {
  const serverTime = ctx.now();
  if (since !== undefined && since > 0) {
    return { ...ctx.repos.pins.listChangedSince(seccion, since), serverTime };
  }
  return { pins: ctx.repos.pins.listVisible(seccion), removed: [], serverTime };
}

export function getThread(ctx: AppContext, pinId: number): Thread | undefined {
  const pin = ctx.repos.pins.get(pinId);
  if (!pin || !notaVisible(ctx, pin)) return undefined;
  return { pin: toDetail(pin), replies: ctx.repos.replies.listVisibleByPin(pinId) };
}

export function search(ctx: AppContext, q: string, seccion: string): SearchHit[] {
  const query = q.trim().slice(0, LIMITS.search.max);
  if (query.length < LIMITS.search.min) return [];
  return ctx.repos.search.search(query, seccion);
}
