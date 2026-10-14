import {
  LIMITS,
  PESO,
  type HiddenReason,
  type PinDetail,
  type PinSummary,
  type Surface,
} from '@pizarra/shared';
import type { DB } from '../db';

export interface PinRow extends PinDetail {
  hiddenAt: number | null;
  hiddenReason: HiddenReason | null;
  hiddenBy: string | null;
}

const SELECT = `
  SELECT p.id, p.seccion_id AS seccion, p.tema_id AS temaId, p.surface, p.x, p.y, p.color, p.reply_count AS replyCount, p.vistas, p.text,
    p.user_id AS authorId, COALESCE(p.autor_moderador, u.name) AS authorName, p.autor_moderador AS autorModerador, u.institution_name AS institutionName,
    p.created_at AS createdAt, p.updated_at AS updatedAt,
    p.hidden_at AS hiddenAt, p.hidden_reason AS hiddenReason, p.hidden_by AS hiddenBy
  FROM pins p JOIN users u ON u.id = p.user_id`;

export function makePreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > LIMITS.preview ? `${flat.slice(0, LIMITS.preview - 1).trimEnd()}…` : flat;
}

export function toSummary(row: PinRow): PinSummary {
  return {
    id: row.id,
    seccion: row.seccion,
    temaId: row.temaId,
    surface: row.surface,
    x: row.x,
    y: row.y,
    color: row.color,
    replyCount: row.replyCount,
    vistas: row.vistas,
    preview: makePreview(row.text),
    authorId: row.authorId,
    authorName: row.authorName,
    autorModerador: row.autorModerador ?? null,
    institutionName: row.institutionName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDetail(row: PinRow): PinDetail {
  return { ...toSummary(row), text: row.text };
}

export function createPinsRepo(db: DB) {
  const insert = db.prepare(`
    INSERT INTO pins (seccion_id, tema_id, surface, x, y, color, text, user_id, autor_moderador, created_at, updated_at)
    VALUES (@seccion, @temaId, @surface, @x, @y, @color, @text, @userId, @autorModerador, @now, @now)`);
  const byId = db.prepare(`${SELECT} WHERE p.id = ?`);
  const insertVista = db.prepare(`
    INSERT OR IGNORE INTO pin_vistas (pin_id, visitante, created_at)
    SELECT id, @visitante, @now FROM pins WHERE id = @id AND vistas < @maximo`);
  const bumpVistas = db.prepare(
    'UPDATE pins SET vistas = vistas + 1 WHERE id = ? RETURNING vistas',
  );
  const publica = `p.hidden_at IS NULL
    AND EXISTS (SELECT 1 FROM secciones s WHERE s.id = p.seccion_id AND s.estado != 'oculta')
    AND (p.tema_id IS NULL OR EXISTS (SELECT 1 FROM temas t WHERE t.id = p.tema_id AND t.oculto = 0))`;
  const visible = db.prepare(`${SELECT} WHERE p.seccion_id = ? AND ${publica}`);
  const moderadoresVisibles = db.prepare(
    `${SELECT} WHERE p.seccion_id = ? AND p.autor_moderador IS NOT NULL AND ${publica}`,
  );
  // ">=" y no ">": cambios en el mismo milisegundo que el snapshot no se pierden (el cliente
  // hace upsert, así que un duplicado es inocuo).
  const changedSince = db.prepare(
    `${SELECT.replace('SELECT p.id,', `SELECT (${publica}) AS publica, p.id,`)} WHERE p.seccion_id = ? AND p.updated_at >= ?`,
  );
  const bump = db.prepare(`
    UPDATE pins SET reply_count = MAX(0, reply_count + @delta), updated_at = @now
    WHERE id = @id RETURNING reply_count AS replyCount`);
  const hide = db.prepare(`
    UPDATE pins SET hidden_at = @now, hidden_by = @by, hidden_reason = @reason, updated_at = @now
    WHERE id = @id AND hidden_at IS NULL`);
  const unhide = db.prepare(`
    UPDATE pins SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL, updated_at = @now
    WHERE id = @id AND hidden_at IS NOT NULL`);
  const reason = db.prepare(
    'UPDATE pins SET hidden_reason = @reason, hidden_by = @by WHERE id = @id AND hidden_at IS NOT NULL',
  );
  const recentDup = db.prepare(
    'SELECT 1 FROM pins WHERE user_id = ? AND text = ? AND created_at > ? LIMIT 1',
  );
  const visibleTexts = db.prepare('SELECT id, text FROM pins WHERE hidden_at IS NULL');

  return {
    insert(p: {
      seccion: string;
      temaId?: string | null;
      surface: Surface;
      x: number;
      y: number;
      color: string;
      text: string;
      userId: number;
      now: number;
      autorModerador?: string | null;
    }): number {
      return Number(
        insert.run({ ...p, autorModerador: p.autorModerador ?? null, temaId: p.temaId ?? null })
          .lastInsertRowid,
      );
    },
    get(id: number): PinRow | undefined {
      return byId.get(id) as PinRow | undefined;
    },
    listVisible(seccion: string): PinSummary[] {
      return (visible.all(seccion) as PinRow[]).map(toSummary);
    },
    listModeradoresVisibles(seccion: string): PinSummary[] {
      return (moderadoresVisibles.all(seccion) as PinRow[]).map(toSummary);
    },
    /** Cambios desde `since`: pines visibles actualizados y los ocultados en ese lapso. */
    listChangedSince(seccion: string, since: number): { pins: PinSummary[]; removed: number[] } {
      const pins: PinSummary[] = [];
      const removed: number[] = [];
      for (const row of changedSince.all(seccion, since) as (PinRow & { publica: number })[]) {
        if (row.publica === 1) pins.push(toSummary(row));
        else removed.push(row.id);
      }
      return { pins, removed };
    },
    /**
     * Cuenta visitas únicas hasta el umbral de crecimiento, independientemente de las respuestas.
     * Después no se guardan identificadores nuevos; se conserva el contador histórico si era mayor.
     */
    registrarVista(id: number, visitante: string, now: number): number | null {
      return db.transaction(() => {
        if (insertVista.run({ id, visitante, now, maximo: PESO.maximo }).changes === 0) return null;
        const row = bumpVistas.get(id) as { vistas: number } | undefined;
        return row?.vistas ?? null;
      })();
    },
    bumpReplyCount(id: number, delta: number, now: number): number {
      const row = bump.get({ id, delta, now }) as { replyCount: number } | undefined;
      return row?.replyCount ?? 0;
    },
    setHidden(id: number, by: string, why: HiddenReason, now: number): boolean {
      return hide.run({ id, by, reason: why, now }).changes > 0;
    },
    clearHidden(id: number, now: number): boolean {
      return unhide.run({ id, now }).changes > 0;
    },
    setHiddenReason(id: number, why: HiddenReason, by: string): boolean {
      return reason.run({ id, reason: why, by }).changes > 0;
    },
    hasRecentDuplicate(userId: number, text: string, since: number): boolean {
      return recentDup.get(userId, text, since) !== undefined;
    },
    visibleTexts(): { id: number; text: string }[] {
      return visibleTexts.all() as { id: number; text: string }[];
    },
  };
}
export type PinsRepo = ReturnType<typeof createPinsRepo>;
