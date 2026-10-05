import type { ModContentItem, ModStats, TargetType } from '@pizarra/shared';
import type { DB } from '../db';

const PIN_ITEM = `
  SELECT 'pin' AS type, p.id, p.id AS pinId, p.text, p.user_id AS authorId, u.name AS authorName,
    u.institution_name AS institutionName, p.created_at AS createdAt, p.hidden_at AS hiddenAt,
    p.hidden_reason AS hiddenReason, p.hidden_by AS hiddenBy,
    (SELECT COUNT(*) FROM reports r
      WHERE r.target_type = 'pin' AND r.target_id = p.id AND r.resolved_at IS NULL) AS reportCount
  FROM pins p JOIN users u ON u.id = p.user_id`;

const REPLY_ITEM = `
  SELECT 'reply' AS type, x.id, x.pin_id AS pinId, x.text, x.user_id AS authorId, u.name AS authorName,
    u.institution_name AS institutionName, x.created_at AS createdAt, x.hidden_at AS hiddenAt,
    x.hidden_reason AS hiddenReason, x.hidden_by AS hiddenBy,
    (SELECT COUNT(*) FROM reports r
      WHERE r.target_type = 'reply' AND r.target_id = x.id AND r.resolved_at IS NULL) AS reportCount
  FROM replies x JOIN users u ON u.id = x.user_id`;

/** Consultas de solo lectura para el panel de moderación y las exportaciones. */
export function createModRepo(db: DB) {
  const feed = db.prepare(`
    SELECT * FROM (${PIN_ITEM} ORDER BY p.created_at DESC LIMIT @limit)
    UNION ALL
    SELECT * FROM (${REPLY_ITEM} ORDER BY x.created_at DESC LIMIT @limit)
    ORDER BY createdAt DESC
    LIMIT @limit`);
  const pinItem = db.prepare(`${PIN_ITEM} WHERE p.id = ?`);
  const replyItem = db.prepare(`${REPLY_ITEM} WHERE x.id = ?`);
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM pins WHERE hidden_at IS NULL) AS pins,
      (SELECT COUNT(*) FROM replies WHERE hidden_at IS NULL) AS replies,
      (SELECT COUNT(*) FROM pins WHERE hidden_at IS NOT NULL) AS hiddenPins,
      (SELECT COUNT(*) FROM replies WHERE hidden_at IS NOT NULL) AS hiddenReplies`);
  const byInstitution = db.prepare(`
    SELECT u.institution_name AS institutionName, COUNT(*) AS users,
      COALESCE(SUM(pc.n), 0) AS pins, COALESCE(SUM(rc.n), 0) AS replies
    FROM users u
    LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM pins GROUP BY user_id) pc ON pc.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM replies GROUP BY user_id) rc ON rc.user_id = u.id
    GROUP BY u.institution_name
    ORDER BY users DESC, institutionName`);
  const exportPins = db.prepare(`
    SELECT p.id, p.created_at AS createdAt, u.name AS author, u.institution_name AS institution,
      p.seccion_id AS seccion, p.tema_id AS temaId, t.nombre AS tema, t.grupo, t.campus,
      p.color, ROUND(p.x) AS x, ROUND(p.y) AS y, p.text, p.reply_count AS replies,
      p.hidden_at AS hiddenAt, p.hidden_reason AS hiddenReason, p.hidden_by AS hiddenBy
    FROM pins p JOIN users u ON u.id = p.user_id LEFT JOIN temas t ON t.id = p.tema_id ORDER BY p.id`);
  const exportReplies = db.prepare(`
    SELECT r.id, r.pin_id AS pinId, r.created_at AS createdAt, u.name AS author,
      u.institution_name AS institution, r.text, r.hidden_at AS hiddenAt,
      r.hidden_reason AS hiddenReason, r.hidden_by AS hiddenBy
    FROM replies r JOIN users u ON u.id = r.user_id ORDER BY r.id`);
  const exportUsers = db.prepare(`
    SELECT u.id, u.created_at AS createdAt, u.name, u.institution_name AS institution,
      u.silenced_at AS silencedAt,
      (SELECT COUNT(*) FROM pins p WHERE p.user_id = u.id) AS pins,
      (SELECT COUNT(*) FROM replies r WHERE r.user_id = u.id) AS replies
    FROM users u ORDER BY u.id`);

  return {
    feed(limit = 100): ModContentItem[] {
      return feed.all({ limit }) as ModContentItem[];
    },
    item(type: TargetType, id: number): ModContentItem | undefined {
      return (type === 'pin' ? pinItem : replyItem).get(id) as ModContentItem | undefined;
    },
    stats(): Omit<ModStats, 'pendingReports' | 'online'> {
      const t = totals.get() as Omit<ModStats, 'pendingReports' | 'online' | 'byInstitution'>;
      return { ...t, byInstitution: byInstitution.all() as ModStats['byInstitution'] };
    },
    exportPins: () => exportPins.all() as Record<string, unknown>[],
    exportReplies: () => exportReplies.all() as Record<string, unknown>[],
    exportUsers: () => exportUsers.all() as Record<string, unknown>[],
  };
}
export type ModRepo = ReturnType<typeof createModRepo>;
