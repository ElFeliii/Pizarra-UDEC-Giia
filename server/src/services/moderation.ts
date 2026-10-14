import {
  LIMITS,
  firstIssue,
  reportInputSchema,
  type Ack,
  type BannedWord,
  type BannedWordMode,
  type HiddenReason,
  type TargetType,
} from '@pizarra/shared';
import type { AppContext } from '../context';
import { getMeta, setMeta } from '../db/db';
import { toSummary } from '../db/repos/pins';
import { toReply } from '../db/repos/replies';
import { Censor } from '../moderation/censor';
import { normalizeTermParts } from '../moderation/normalize';
import { DEFAULT_WORDLIST, WORDLIST_VERSION } from '../moderation/wordlist.default';
import { fail, ok, rateLimited } from './errors';
import { notaVisible } from './content';

const SYSTEM = 'sistema';

// ---------------------------------------------------------------------------
// Lista de palabras

/**
 * Carga la semilla de palabras. Solo agrega lo que falta: lo que el moderador haya agregado
 * se mantiene, y al subir `WORDLIST_VERSION` las bases existentes reciben los términos nuevos.
 * (Un término que el moderador borró y que sigue en la semilla vuelve a aparecer.)
 */
export function seedWordlist(ctx: AppContext): number {
  const previa = Number(
    getMeta(ctx.db, 'wordlist_version') ?? (getMeta(ctx.db, 'wordlist_seeded') ? 1 : 0),
  );
  if (previa >= WORDLIST_VERSION) return 0;
  const antes = ctx.repos.bannedWords.list().length;
  ctx.repos.bannedWords.addMany(DEFAULT_WORDLIST, SYSTEM, ctx.now());
  setMeta(ctx.db, 'wordlist_version', String(WORDLIST_VERSION));
  setMeta(ctx.db, 'wordlist_seeded', String(ctx.now()));
  return ctx.repos.bannedWords.list().length - antes;
}

export function reloadCensor(ctx: AppContext): void {
  ctx.censor.setTerms(ctx.repos.bannedWords.list());
  ctx.topWords.reconstruir();
}

export function addBannedWord(
  ctx: AppContext,
  term: string,
  mode: BannedWordMode,
  moderator: string,
): Ack<BannedWord> {
  const clean = term.trim().toLowerCase().replace(/\s+/g, ' ');
  const partes = normalizeTermParts(clean);
  // Se aceptan frases cortas ("sieg heil"), no oraciones completas.
  if (partes.length === 0 || partes.length > 5) {
    return fail('VALIDATION', 'Ingresa una palabra o una frase de hasta 5 palabras.');
  }
  if (partes.join('').length < LIMITS.bannedTerm.min) {
    return fail('VALIDATION', 'La palabra es muy corta.');
  }
  const word = ctx.repos.bannedWords.add(clean, mode, moderator, ctx.now());
  if (!word) return fail('VALIDATION', 'Esa palabra ya está en la lista.');
  reloadCensor(ctx);
  ctx.repos.modLog.add({
    moderator,
    action: 'word.add',
    detail: `${mode}:${clean}`,
    now: ctx.now(),
  });
  return ok(word);
}

export function removeBannedWord(ctx: AppContext, id: number, moderator: string): boolean {
  const word = ctx.repos.bannedWords.get(id);
  if (!word || !ctx.repos.bannedWords.remove(id)) return false;
  reloadCensor(ctx);
  ctx.repos.modLog.add({
    moderator,
    action: 'word.remove',
    detail: `${word.mode}:${word.term}`,
    now: ctx.now(),
  });
  return true;
}

/** Oculta el contenido visible que contenga una palabra de la lista (aplicación retroactiva). */
export function applyBannedWord(
  ctx: AppContext,
  id: number,
  moderator: string,
): { pins: number; replies: number } | undefined {
  const word = ctx.repos.bannedWords.get(id);
  if (!word) return undefined;
  const matcher = Censor.single(word);
  let pins = 0;
  let replies = 0;
  for (const p of ctx.repos.pins.visibleTexts()) {
    if (matcher.isBlocked(p.text) && hideContent(ctx, 'pin', p.id, moderator, 'word')) pins++;
  }
  for (const r of ctx.repos.replies.visibleTexts()) {
    if (matcher.isBlocked(r.text) && hideContent(ctx, 'reply', r.id, moderator, 'word')) replies++;
  }
  ctx.repos.modLog.add({
    moderator,
    action: 'word.apply',
    detail: `${word.term}: ${pins} pines, ${replies} respuestas`,
    now: ctx.now(),
  });
  return { pins, replies };
}

// ---------------------------------------------------------------------------
// Ocultar / restaurar

/** Oculta un pin o respuesta. Devuelve false si no existía o ya estaba oculto. */
export function hideContent(
  ctx: AppContext,
  type: TargetType,
  id: number,
  by: string,
  reason: HiddenReason,
): boolean {
  const { repos } = ctx;
  const now = ctx.now();

  if (type === 'pin') {
    const pin = repos.pins.get(id);
    if (!pin) return false;
    const textos = repos.wordCounts.textosVisibles({ pinId: id });
    const changed = ctx.db.transaction(() => {
      if (!repos.pins.setHidden(id, by, reason, now)) return false;
      ctx.topWords.ajustarVisibilidad(textos, []);
      return true;
    })();
    if (!changed) return false;
    ctx.broadcaster.pinRemoved(id);
    ctx.broadcaster.modChanged('pin', id, now, reason);
    return true;
  }

  const reply = repos.replies.get(id);
  if (!reply) return false;
  const count = ctx.db.transaction(() => {
    if (!repos.replies.setHidden(id, by, reason, now)) return null;
    const padre = repos.pins.get(reply.pinId);
    if (padre && notaVisible(ctx, padre)) ctx.topWords.apply(reply.text, -1);
    return repos.pins.bumpReplyCount(reply.pinId, -1, now);
  })();
  if (count === null) return false;
  ctx.broadcaster.replyRemoved(id, reply.pinId);
  ctx.broadcaster.replyCountChanged(reply.pinId, count);
  ctx.broadcaster.modChanged('reply', id, now, reason);
  return true;
}

export function restoreContent(
  ctx: AppContext,
  type: TargetType,
  id: number,
  moderator: string,
): boolean {
  const { repos } = ctx;
  const now = ctx.now();

  if (type === 'pin') {
    const pin = repos.pins.get(id);
    if (!pin) return false;
    const changed = ctx.db.transaction(() => {
      if (!repos.pins.clearHidden(id, now)) return false;
      repos.reports.resolve('pin', id, moderator, now);
      ctx.topWords.ajustarVisibilidad([], repos.wordCounts.textosVisibles({ pinId: id }));
      return true;
    })();
    if (!changed) return false;
    ctx.broadcaster.pinRestored(toSummary(repos.pins.get(id)!));
  } else {
    const reply = repos.replies.get(id);
    if (!reply) return false;
    const count = ctx.db.transaction(() => {
      if (!repos.replies.clearHidden(id)) return null;
      repos.reports.resolve('reply', id, moderator, now);
      const padre = repos.pins.get(reply.pinId);
      if (padre && notaVisible(ctx, padre)) ctx.topWords.apply(reply.text, 1);
      return repos.pins.bumpReplyCount(reply.pinId, 1, now);
    })();
    if (count === null) return false;
    ctx.broadcaster.replyRestored(toReply(reply));
    ctx.broadcaster.replyCountChanged(reply.pinId, count);
  }

  ctx.broadcaster.modChanged(type, id, null, null);
  repos.modLog.add({ moderator, action: 'restore', targetType: type, targetId: id, now });
  return true;
}

/** Ocultar por decisión del moderador (también cierra los reportes pendientes). */
export function moderatorHide(
  ctx: AppContext,
  type: TargetType,
  id: number,
  moderator: string,
): boolean {
  const now = ctx.now();
  let done = hideContent(ctx, type, id, moderator, 'mod');
  if (!done) {
    // Ya estaba oculto (p. ej. por reportes): el moderador lo confirma.
    const repo = type === 'pin' ? ctx.repos.pins : ctx.repos.replies;
    done = repo.setHiddenReason(id, 'mod', moderator);
    if (done) ctx.broadcaster.modChanged(type, id, now, 'mod');
  }
  if (!done) return false;
  ctx.repos.reports.resolve(type, id, moderator, now);
  ctx.repos.modLog.add({ moderator, action: 'hide', targetType: type, targetId: id, now });
  return true;
}

/** Descarta los reportes de un elemento visible (el moderador decide que está bien). */
export function dismissReports(
  ctx: AppContext,
  type: TargetType,
  id: number,
  moderator: string,
): number {
  const now = ctx.now();
  const n = ctx.repos.reports.resolve(type, id, moderator, now);
  if (n > 0) {
    ctx.repos.modLog.add({ moderator, action: 'dismiss', targetType: type, targetId: id, now });
  }
  return n;
}

// ---------------------------------------------------------------------------
// Reportes de usuarios

export function reportContent(
  ctx: AppContext,
  userId: number,
  input: unknown,
  ip: string,
): Ack<{ received: true }> {
  const user = ctx.repos.users.findById(userId);
  if (!user) return fail('NO_SESSION');

  const rl = ctx.limiters.report.take(`u${user.id}`, ip);
  if (!rl.ok) return rateLimited(rl.retryAfterMs);

  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', firstIssue(parsed.error));
  const { targetType, targetId, reason } = parsed.data;

  const target =
    targetType === 'pin' ? ctx.repos.pins.get(targetId) : ctx.repos.replies.get(targetId);
  if (!target) return fail('NOT_FOUND');
  if (target.hiddenAt !== null) return ok({ received: true });

  const added = ctx.repos.reports.add(targetType, targetId, user.id, reason || null, ctx.now());
  if (!added) return ok({ received: true });

  const threshold = ctx.config.autoHideReports;
  // La firma proviene de la sesión autenticada: los reportes del equipo requieren revisión humana.
  const autoHidden =
    target.autorModerador === null &&
    threshold > 0 &&
    ctx.repos.reports.openCount(targetType, targetId) >= threshold &&
    hideContent(ctx, targetType, targetId, SYSTEM, 'reports');
  ctx.broadcaster.modReport(targetType, targetId, autoHidden);
  return ok({ received: true });
}

// ---------------------------------------------------------------------------
// Usuarios

export function setSilenced(
  ctx: AppContext,
  userId: number,
  silenced: boolean,
  moderator: string,
): boolean {
  const now = ctx.now();
  if (!ctx.repos.users.setSilenced(userId, silenced ? now : null)) return false;
  ctx.broadcaster.userSilenced(userId, silenced);
  ctx.repos.modLog.add({
    moderator,
    action: silenced ? 'silence' : 'unsilence',
    targetType: 'user',
    targetId: userId,
    now,
  });
  return true;
}
