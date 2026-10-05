import type { BannedWord, BannedWordMode, TopWord } from '@pizarra/shared';
import type { DB } from '../db';

export function createBannedWordsRepo(db: DB) {
  const list = db.prepare(`
    SELECT id, term, mode, created_by AS createdBy, created_at AS createdAt
    FROM banned_words ORDER BY term`);
  const byId = db.prepare(`
    SELECT id, term, mode, created_by AS createdBy, created_at AS createdAt
    FROM banned_words WHERE id = ?`);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO banned_words (term, mode, created_by, created_at)
    VALUES (@term, @mode, @by, @now)`);
  const remove = db.prepare('DELETE FROM banned_words WHERE id = ?');

  return {
    list(): BannedWord[] {
      return list.all() as BannedWord[];
    },
    get(id: number): BannedWord | undefined {
      return byId.get(id) as BannedWord | undefined;
    },
    /** Devuelve la palabra creada, o undefined si ya existía. */
    add(term: string, mode: BannedWordMode, by: string, now: number): BannedWord | undefined {
      const res = insert.run({ term, mode, by, now });
      if (res.changes === 0) return undefined;
      return { id: Number(res.lastInsertRowid), term, mode, createdBy: by, createdAt: now };
    },
    addMany(terms: { term: string; mode: BannedWordMode }[], by: string, now: number): void {
      db.transaction(() => {
        for (const t of terms) insert.run({ ...t, by, now });
      })();
    },
    remove(id: number): boolean {
      return remove.run(id).changes > 0;
    },
  };
}
export type BannedWordsRepo = ReturnType<typeof createBannedWordsRepo>;

export function createWordCountsRepo(db: DB) {
  const upsert = db.prepare(`
    INSERT INTO word_counts (word, display, count) VALUES (@word, @display, @delta)
    ON CONFLICT(word) DO UPDATE SET count = MAX(0, count + @delta), display = @display`);
  const top = db.prepare(
    'SELECT display AS word, count FROM word_counts WHERE count > 0 ORDER BY count DESC, word LIMIT ?',
  );
  const clear = db.prepare('DELETE FROM word_counts WHERE word = ?');

  return {
    /** Aplica deltas (debe llamarse dentro de la transacción del contenido). */
    apply(words: Map<string, string>, delta: 1 | -1): void {
      for (const [word, display] of words) upsert.run({ word, display, delta });
    },
    top(limit: number): TopWord[] {
      return top.all(limit) as TopWord[];
    },
    remove(word: string): void {
      clear.run(word);
    },
  };
}
export type WordCountsRepo = ReturnType<typeof createWordCountsRepo>;
