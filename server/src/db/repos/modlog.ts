import type { DB } from '../db';

export function createModLogRepo(db: DB) {
  const insert = db.prepare(`
    INSERT INTO mod_log (moderator, action, target_type, target_id, detail, created_at)
    VALUES (@moderator, @action, @targetType, @targetId, @detail, @now)`);

  return {
    add(e: {
      moderator: string;
      action: string;
      targetType?: string | null;
      targetId?: number | null;
      detail?: string | null;
      now: number;
    }): void {
      insert.run({ targetType: null, targetId: null, detail: null, ...e });
    },
  };
}
export type ModLogRepo = ReturnType<typeof createModLogRepo>;
