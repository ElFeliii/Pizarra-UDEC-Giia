import type { ModReportItem, TargetType } from '@pizarra/shared';
import type { DB } from '../db';

const SEP = '\u001F';

export function createReportsRepo(db: DB) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO reports (target_type, target_id, user_id, reason, created_at)
    VALUES (@type, @id, @userId, @reason, @now)`);
  const openCount = db.prepare(`
    SELECT COUNT(*) AS n FROM reports
    WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL`);
  const resolve = db.prepare(`
    UPDATE reports SET resolved_at = @now, resolved_by = @by
    WHERE target_type = @type AND target_id = @id AND resolved_at IS NULL`);
  const pending = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT 1 FROM reports WHERE resolved_at IS NULL GROUP BY target_type, target_id
    )`);
  const queue = db.prepare(`
    SELECT 'pin' AS type, p.id, p.id AS pinId, p.text, p.user_id AS authorId, u.name AS authorName,
      u.institution_name AS institutionName, p.created_at AS createdAt, p.hidden_at AS hiddenAt,
      p.hidden_reason AS hiddenReason, COUNT(r.id) AS reportCount,
      group_concat(r.reason, '${SEP}') AS reasons, MAX(r.created_at) AS lastReportAt
    FROM reports r
    JOIN pins p ON r.target_type = 'pin' AND p.id = r.target_id
    JOIN users u ON u.id = p.user_id
    WHERE r.resolved_at IS NULL
    GROUP BY p.id
    UNION ALL
    SELECT 'reply' AS type, x.id, x.pin_id AS pinId, x.text, x.user_id AS authorId, u.name AS authorName,
      u.institution_name AS institutionName, x.created_at AS createdAt, x.hidden_at AS hiddenAt,
      x.hidden_reason AS hiddenReason, COUNT(r.id) AS reportCount,
      group_concat(r.reason, '${SEP}') AS reasons, MAX(r.created_at) AS lastReportAt
    FROM reports r
    JOIN replies x ON r.target_type = 'reply' AND x.id = r.target_id
    JOIN users u ON u.id = x.user_id
    WHERE r.resolved_at IS NULL
    GROUP BY x.id
    ORDER BY lastReportAt DESC
    LIMIT 300`);

  return {
    /** true si es un reporte nuevo (cada usuario reporta una vez por elemento). */
    add(type: TargetType, id: number, userId: number, reason: string | null, now: number): boolean {
      return insert.run({ type, id, userId, reason, now }).changes > 0;
    },
    openCount(type: TargetType, id: number): number {
      return (openCount.get(type, id) as { n: number }).n;
    },
    resolve(type: TargetType, id: number, by: string, now: number): number {
      return resolve.run({ type, id, by, now }).changes;
    },
    pendingTargets(): number {
      return (pending.get() as { n: number }).n;
    },
    queue(): ModReportItem[] {
      return (queue.all() as (Omit<ModReportItem, 'reasons'> & { reasons: string | null })[]).map(
        (row) => ({ ...row, reasons: row.reasons ? row.reasons.split(SEP).filter(Boolean) : [] }),
      );
    },
  };
}
export type ReportsRepo = ReturnType<typeof createReportsRepo>;
