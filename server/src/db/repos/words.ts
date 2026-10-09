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
  const vaciar = db.prepare('DELETE FROM word_counts');
  const textos = db.prepare(`
    WITH notas_publicas AS (
      SELECT p.id, p.text FROM pins p
      JOIN secciones s ON s.id = p.seccion_id AND s.estado != 'oculta'
      LEFT JOIN temas t ON t.id = p.tema_id
      WHERE p.hidden_at IS NULL AND (p.tema_id IS NULL OR t.oculto = 0)
        AND (@seccion IS NULL OR p.seccion_id = @seccion)
        AND (@temaId IS NULL OR p.tema_id = @temaId)
        AND (@pinId IS NULL OR p.id = @pinId)
    )
    SELECT text FROM notas_publicas
    UNION ALL
    SELECT r.text FROM replies r JOIN notas_publicas p ON p.id = r.pin_id
    WHERE r.hidden_at IS NULL`);

  return {
    /** Aplica deltas (debe llamarse dentro de la transacción del contenido). */
    apply(words: Map<string, string>, delta: 1 | -1): void {
      for (const [word, display] of words) upsert.run({ word, display, delta });
    },
    /** Solo se consulta el ámbito afectado al ocultar/restaurar; publicar sigue usando deltas. */
    textosVisibles(filtro: { seccion?: string; temaId?: string; pinId?: number } = {}): string[] {
      return (
        textos.all({
          seccion: filtro.seccion ?? null,
          temaId: filtro.temaId ?? null,
          pinId: filtro.pinId ?? null,
        }) as { text: string }[]
      ).map((fila) => fila.text);
    },
    reemplazar(palabras: Map<string, string>[]): void {
      db.transaction(() => {
        vaciar.run();
        for (const texto of palabras) {
          for (const [word, display] of texto) upsert.run({ word, display, delta: 1 });
        }
      })();
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
