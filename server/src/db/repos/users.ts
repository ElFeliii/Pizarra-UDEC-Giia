import type { ModUser } from '@pizarra/shared';
import type { DB } from '../db';

export interface UserRow {
  id: number;
  name: string;
  institutionId: string;
  institutionName: string;
  createdAt: number;
  silencedAt: number | null;
}

const COLS = `id, name, institution_id AS institutionId, institution_name AS institutionName,
  created_at AS createdAt, silenced_at AS silencedAt`;

export function createUsersRepo(db: DB) {
  const insert = db.prepare(`
    INSERT INTO users (token_hash, name, institution_id, institution_name, ip, created_at)
    VALUES (@tokenHash, @name, @institutionId, @institutionName, @ip, @createdAt)`);
  const byHash = db.prepare(`SELECT ${COLS} FROM users WHERE token_hash = ?`);
  const byId = db.prepare(`SELECT ${COLS} FROM users WHERE id = ?`);
  const silence = db.prepare('UPDATE users SET silenced_at = ? WHERE id = ?');
  const list = db.prepare(`
    SELECT u.id, u.name, u.institution_name AS institutionName, u.created_at AS createdAt,
      u.silenced_at AS silencedAt,
      (SELECT COUNT(*) FROM pins p WHERE p.user_id = u.id) AS pinCount,
      (SELECT COUNT(*) FROM replies r WHERE r.user_id = u.id) AS replyCount
    FROM users u
    WHERE (@q IS NULL OR u.name LIKE @q ESCAPE '\\' OR u.institution_name LIKE @q ESCAPE '\\')
      AND (@silencedOnly = 0 OR u.silenced_at IS NOT NULL)
    ORDER BY u.created_at DESC
    LIMIT @limit`);

  return {
    create(u: {
      tokenHash: string;
      name: string;
      institutionId: string;
      institutionName: string;
      ip: string | null;
      createdAt: number;
    }): UserRow {
      const id = Number(insert.run(u).lastInsertRowid);
      return {
        id,
        name: u.name,
        institutionId: u.institutionId,
        institutionName: u.institutionName,
        createdAt: u.createdAt,
        silencedAt: null,
      };
    },
    findByTokenHash(hash: string): UserRow | undefined {
      return byHash.get(hash) as UserRow | undefined;
    },
    findById(id: number): UserRow | undefined {
      return byId.get(id) as UserRow | undefined;
    },
    setSilenced(id: number, at: number | null): boolean {
      return silence.run(at, id).changes > 0;
    },
    list(opts: { q?: string; silencedOnly?: boolean; limit?: number }): ModUser[] {
      const q = opts.q ? `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
      return list.all({
        q,
        silencedOnly: opts.silencedOnly ? 1 : 0,
        limit: opts.limit ?? 100,
      }) as ModUser[];
    },
  };
}
export type UsersRepo = ReturnType<typeof createUsersRepo>;
