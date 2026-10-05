import type { EstadoSeccion, Seccion } from '@pizarra/shared';
import type { DB } from '../db';

export function createSeccionesRepo(db: DB) {
  const list = db.prepare(`
    SELECT id, tipo, nombre, orden, estado, updated_at AS updatedAt
    FROM secciones ORDER BY orden`);
  const byId = db.prepare(`
    SELECT id, tipo, nombre, orden, estado, updated_at AS updatedAt
    FROM secciones WHERE id = ?`);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO secciones (id, tipo, nombre, orden, estado, updated_at)
    VALUES (@id, @tipo, @nombre, @orden, @estado, @now)`);
  const setEstado = db.prepare('UPDATE secciones SET estado = ?, updated_at = ? WHERE id = ?');

  return {
    list(): Seccion[] {
      return list.all() as Seccion[];
    },
    get(id: string): Seccion | undefined {
      return byId.get(id) as Seccion | undefined;
    },
    /** Agrega las que falten sin tocar las que ya están: el moderador manda sobre la semilla. */
    addMissing(secciones: Omit<Seccion, 'updatedAt'>[], now: number): number {
      return db.transaction(() => {
        let nuevas = 0;
        for (const s of secciones) nuevas += insert.run({ ...s, now }).changes;
        return nuevas;
      })();
    },
    /** Devuelve la sección ya actualizada, o undefined si no existe o no cambió nada. */
    setEstado(id: string, estado: EstadoSeccion, now: number): Seccion | undefined {
      const actual = this.get(id);
      if (!actual || actual.estado === estado) return undefined;
      setEstado.run(estado, now, id);
      return { ...actual, estado, updatedAt: now };
    },
  };
}
