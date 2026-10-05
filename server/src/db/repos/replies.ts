import type { HiddenReason, Reply } from '@pizarra/shared';
import type { DB } from '../db';

export interface ReplyRow extends Reply {
  hiddenAt: number | null;
  hiddenReason: HiddenReason | null;
  hiddenBy: string | null;
}

const SELECT = `
  SELECT r.id, r.pin_id AS pinId, r.text, r.user_id AS authorId, COALESCE(r.autor_moderador, u.name) AS authorName, r.autor_moderador AS autorModerador,
    u.institution_name AS institutionName, r.created_at AS createdAt,
    r.hidden_at AS hiddenAt, r.hidden_reason AS hiddenReason, r.hidden_by AS hiddenBy
  FROM replies r JOIN users u ON u.id = r.user_id`;

export function toReply(row: ReplyRow): Reply {
  return {
    id: row.id,
    pinId: row.pinId,
    text: row.text,
    authorId: row.authorId,
    authorName: row.authorName,
    autorModerador: row.autorModerador ?? null,
    institutionName: row.institutionName,
    createdAt: row.createdAt,
  };
}

export function createRepliesRepo(db: DB) {
  const insert = db.prepare(`
    INSERT INTO replies (pin_id, text, user_id, autor_moderador, created_at)
    VALUES (@pinId, @text, @userId, @autorModerador, @now)`);
  const byId = db.prepare(`${SELECT} WHERE r.id = ?`);
  const byPin = db.prepare(
    `${SELECT} WHERE r.pin_id = ? AND r.hidden_at IS NULL ORDER BY r.created_at, r.id`,
  );
  const hide = db.prepare(`
    UPDATE replies SET hidden_at = @now, hidden_by = @by, hidden_reason = @reason
    WHERE id = @id AND hidden_at IS NULL`);
  const unhide = db.prepare(`
    UPDATE replies SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL
    WHERE id = @id AND hidden_at IS NOT NULL`);
  const reason = db.prepare(
    'UPDATE replies SET hidden_reason = @reason, hidden_by = @by WHERE id = @id AND hidden_at IS NOT NULL',
  );
  const recentDup = db.prepare(
    'SELECT 1 FROM replies WHERE user_id = ? AND pin_id = ? AND text = ? AND created_at > ? LIMIT 1',
  );
  const visibleTexts = db.prepare('SELECT id, text FROM replies WHERE hidden_at IS NULL');

  return {
    insert(r: {
      pinId: number;
      text: string;
      userId: number;
      now: number;
      autorModerador?: string | null;
    }): number {
      return Number(insert.run({ ...r, autorModerador: r.autorModerador ?? null }).lastInsertRowid);
    },
    get(id: number): ReplyRow | undefined {
      return byId.get(id) as ReplyRow | undefined;
    },
    listVisibleByPin(pinId: number): Reply[] {
      return (byPin.all(pinId) as ReplyRow[]).map(toReply);
    },
    setHidden(id: number, by: string, why: HiddenReason, now: number): boolean {
      return hide.run({ id, by, reason: why, now }).changes > 0;
    },
    clearHidden(id: number): boolean {
      return unhide.run({ id }).changes > 0;
    },
    setHiddenReason(id: number, why: HiddenReason, by: string): boolean {
      return reason.run({ id, reason: why, by }).changes > 0;
    },
    hasRecentDuplicate(userId: number, pinId: number, text: string, since: number): boolean {
      return recentDup.get(userId, pinId, text, since) !== undefined;
    },
    visibleTexts(): { id: number; text: string }[] {
      return visibleTexts.all() as { id: number; text: string }[];
    },
  };
}
export type RepliesRepo = ReturnType<typeof createRepliesRepo>;
