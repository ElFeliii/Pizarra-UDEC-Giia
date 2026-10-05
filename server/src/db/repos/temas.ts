import type { Tema } from '@pizarra/shared';
import type { DB } from '../db';

const SELECCION = `SELECT id, seccion_id AS seccion, nombre, grupo, campus, orden, oculto FROM temas`;
type FilaTema = Omit<Tema, 'oculto'> & { oculto: number };
const convertir = (fila: FilaTema): Tema => ({ ...fila, oculto: fila.oculto === 1 });

export function crearTemasRepo(db: DB) {
  const listar = db.prepare(`${SELECCION} ORDER BY orden, nombre, id`);
  const porId = db.prepare(`${SELECCION} WHERE id = ?`);
  const insertar = db.prepare(`INSERT OR IGNORE INTO temas
    (id, seccion_id, nombre, grupo, campus, orden, oculto)
    VALUES (@id, @seccion, @nombre, @grupo, @campus, @orden, @oculto)`);
  const ocultar = db.prepare('UPDATE temas SET oculto = ? WHERE id = ?');
  const actualizarNotas = db.prepare('UPDATE pins SET updated_at = ? WHERE tema_id = ?');
  return {
    listar(): Tema[] {
      return (listar.all() as FilaTema[]).map(convertir);
    },
    obtener(id: string): Tema | undefined {
      const fila = porId.get(id) as FilaTema | undefined;
      return fila ? convertir(fila) : undefined;
    },
    agregarFaltantes(temas: Tema[]): number {
      return db.transaction(() =>
        temas.reduce(
          (total, tema) => total + insertar.run({ ...tema, oculto: tema.oculto ? 1 : 0 }).changes,
          0,
        ),
      )();
    },
    cambiarOculto(id: string, oculto: boolean, ahora: number): Tema | undefined {
      return db.transaction(() => {
        if (!ocultar.run(oculto ? 1 : 0, id).changes) return undefined;
        actualizarNotas.run(ahora, id);
        const fila = porId.get(id) as FilaTema;
        return convertir(fila);
      })();
    },
  };
}
