import type { SearchHit } from '@pizarra/shared';
import { foldCase } from '../../moderation/normalize';
import type { DB } from '../db';

/** Marcadores de resaltado en los snippets (caracteres de uso privado: no chocan con texto real). */
export const HL_START = '\uE000';
export const HL_END = '\uE001';

/** Convierte lo que escribe el usuario en una consulta FTS5 segura: cada palabra como prefijo. */
export function buildMatchQuery(q: string): string | null {
  const tokens = foldCase(q)
    .split(/[^a-zñ0-9]+/)
    .filter(Boolean)
    .slice(0, 6);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export function createSearchRepo(db: DB) {
  const index = db.prepare(`
    INSERT INTO content_fts (text, author, institution, kind, ref_id, pin_id)
    VALUES (@text, @author, @institution, @kind, @refId, @pinId)`);
  const search = db.prepare(`
    SELECT content_fts.kind AS kind, content_fts.ref_id AS refId, content_fts.pin_id AS pinId,
      snippet(content_fts, 0, '${HL_START}', '${HL_END}', '…', 14) AS snippet,
      content_fts.author AS authorName, content_fts.institution AS institutionName
    FROM content_fts
    JOIN pins p ON p.id = content_fts.pin_id AND p.hidden_at IS NULL AND p.seccion_id = @seccion
    LEFT JOIN replies r ON content_fts.kind = 'reply' AND r.id = content_fts.ref_id
    WHERE content_fts MATCH @q
      AND EXISTS (SELECT 1 FROM secciones s WHERE s.id = p.seccion_id AND s.estado != 'oculta')
      AND (p.tema_id IS NULL OR EXISTS (SELECT 1 FROM temas t WHERE t.id = p.tema_id AND t.oculto = 0))
      AND (content_fts.kind = 'pin' OR r.hidden_at IS NULL)
    ORDER BY rank
    LIMIT 40`);

  return {
    index(e: {
      kind: 'pin' | 'reply';
      refId: number;
      pinId: number;
      text: string;
      author: string;
      institution: string;
    }): void {
      index.run(e);
    },
    search(q: string, seccion: string): SearchHit[] {
      const match = buildMatchQuery(q);
      if (!match) return [];
      return search.all({ q: match, seccion }) as SearchHit[];
    },
  };
}
export type SearchRepo = ReturnType<typeof createSearchRepo>;
