import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/db';
import { MIGRATIONS } from '../src/db/schema';

/**
 * Las migraciones se prueban contra una base **con datos**, no vacía. Una base vacía no ejecuta
 * los rellenos (`UPDATE ... SET`) y deja pasar errores que solo aparecen en el servidor real,
 * como una clave foránea apuntando a una fila que todavía no existe.
 */
function baseEnVersion(version: number): string {
  const file = join(mkdtempSync(join(tmpdir(), 'pizarra-migra-')), 'pizarra.db');
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  for (let v = 0; v < version; v++) db.exec(MIGRATIONS[v]!);
  db.pragma(`user_version = ${version}`);

  const user = db
    .prepare(
      `INSERT INTO users (token_hash, name, institution_id, institution_name, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run('token-de-prueba', 'Ana', 'colegio-ejemplo-1', 'Colegio ejemplo 1', '192.0.2.1', 1);

  const insertPin = db.prepare(
    `INSERT INTO pins (surface, x, y, color, text, user_id, created_at, updated_at)
     VALUES (?, 10, 10, 'azul', ?, ?, 1, 1)`,
  );
  insertPin.run('board', 'Una nota de la pizarra', user.lastInsertRowid);
  insertPin.run('map', 'Un pin del mapa', user.lastInsertRowid);
  db.close();
  return file;
}

describe('migraciones sobre una base con datos', () => {
  it('v5 conserva una base v4 con temas, notas, respuestas, visitas y reportes sin inventar firmas', () => {
    const archivo = baseEnVersion(4);
    const previa = new Database(archivo);
    previa.exec(`UPDATE pins SET seccion_id = CASE surface WHEN 'map' THEN 'mapa' ELSE 'pizarra' END;
      INSERT INTO temas VALUES ('tema-anterior', 'pizarra', 'Tema anterior', NULL, NULL, 1, 0);
      UPDATE pins SET tema_id = 'tema-anterior', vistas = 1, reply_count = 1 WHERE id = 1;
      INSERT INTO replies (pin_id, text, user_id, created_at) VALUES (1, 'Respuesta anterior', 1, 2);
      INSERT INTO pin_vistas VALUES (1, 'visita-anterior', 2);
      INSERT INTO reports (target_type, target_id, user_id, created_at) VALUES ('pin', 1, 1, 3);`);
    const tablas = ['users', 'pins', 'replies', 'temas', 'pin_vistas', 'reports'];
    const antes = tablas.map((tabla) => previa.prepare(`SELECT * FROM ${tabla}`).all());
    previa.close();
    const migrada = new Database(archivo);
    migrada.pragma('foreign_keys = ON');
    migrada.exec(MIGRATIONS[4]!);
    migrada.pragma('user_version = 5');
    try {
      expect(migrada.pragma('user_version', { simple: true })).toBe(5);
      for (const [indice, tabla] of tablas.entries()) {
        const esperado = (antes[indice] as Record<string, unknown>[]).map((fila) =>
          ['pins', 'replies'].includes(tabla) ? { ...fila, autor_moderador: null } : fila,
        );
        expect(migrada.prepare(`SELECT * FROM ${tabla}`).all()).toEqual(esperado);
      }
      expect(migrada.pragma('foreign_key_check')).toEqual([]);
    } finally {
      migrada.close();
    }
  });
  it('v4 conserva notas, respuestas, visitas, reportes e índice de una base v3 poblada', () => {
    const archivo = baseEnVersion(3);
    const previa = new Database(archivo);
    previa.pragma('foreign_keys = ON');
    previa.exec(`UPDATE pins SET seccion_id = CASE surface WHEN 'map' THEN 'mapa' ELSE 'pizarra' END;
      INSERT INTO secciones VALUES ('historias', 'muro', 'Historias', 4, 'abierta', 1);
      INSERT INTO pins (seccion_id, surface, x, y, color, text, user_id, created_at, updated_at)
        VALUES ('historias', 'board', 0, 0, 'verde', 'Una historia anterior', 1, 2, 2);
      INSERT INTO replies (pin_id, text, user_id, created_at) VALUES (3, 'Respuesta anterior', 1, 3);
      UPDATE pins SET reply_count = 1, vistas = 1 WHERE id = 3;
      INSERT INTO pin_vistas VALUES (3, 'visitante-anterior', 4);
      INSERT INTO reports (target_type, target_id, user_id, created_at) VALUES ('pin', 3, 1, 5);
      INSERT INTO content_fts (text, author, institution, kind, ref_id, pin_id)
        VALUES ('Una historia anterior', 'Ana', 'Colegio ejemplo 1', 'pin', 3, 3);`);
    const tablas = ['users', 'pins', 'replies', 'pin_vistas', 'reports', 'content_fts'];
    const antes = tablas.map((tabla) => previa.prepare(`SELECT * FROM ${tabla}`).all());
    previa.close();
    const migrada = new Database(archivo);
    migrada.pragma('foreign_keys = ON');
    migrada.exec(MIGRATIONS[3]!);
    migrada.pragma('user_version = 4');
    try {
      expect(migrada.pragma('user_version', { simple: true })).toBe(4);
      for (const [indice, tabla] of tablas.entries()) {
        const despues = migrada.prepare(`SELECT * FROM ${tabla}`).all();
        if (tabla === 'pins') {
          expect(despues).toEqual(
            (antes[indice] as Record<string, unknown>[]).map((pin) => ({ ...pin, tema_id: null })),
          );
        } else expect(despues).toEqual(antes[indice]);
      }
      expect(migrada.pragma('foreign_key_check')).toEqual([]);
      expect(() =>
        migrada.prepare("UPDATE pins SET tema_id = 'tema-inexistente' WHERE id = 3").run(),
      ).toThrow(/FOREIGN KEY/);
      expect(migrada.prepare('SELECT COUNT(*) AS n FROM temas').get()).toEqual({ n: 0 });
    } finally {
      migrada.close();
    }
  });

  it('llegan a la última versión sin romper nada', () => {
    const db = openDatabase(baseEnVersion(1));
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    db.close();
  });

  it('los pines que ya existían quedan en su sección', () => {
    const db = openDatabase(baseEnVersion(1));
    const sinSeccion = db.prepare('SELECT COUNT(*) AS n FROM pins WHERE seccion_id IS NULL').get();
    expect(sinSeccion).toEqual({ n: 0 });

    const porSeccion = db
      .prepare('SELECT seccion_id AS id, COUNT(*) AS n FROM pins GROUP BY seccion_id ORDER BY id')
      .all();
    expect(porSeccion).toEqual([
      { id: 'mapa', n: 1 },
      { id: 'pizarra', n: 1 },
    ]);
    db.close();
  });

  it('una base ya migrada no vuelve a migrar', () => {
    const file = baseEnVersion(1);
    openDatabase(file).close();
    const db = openDatabase(file);
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    expect(db.prepare('SELECT COUNT(*) AS n FROM pins').get()).toEqual({ n: 2 });
    db.close();
  });
});

describe('migración v6 sobre visitas existentes', () => {
  it('retira visitas saturadas sin cambiar contenido, contadores ni firmas y se aplica una sola vez', () => {
    const archivo = baseEnVersion(5);
    const previa = new Database(archivo);
    previa.pragma('foreign_keys = ON');
    previa.exec(`UPDATE pins SET seccion_id = CASE surface WHEN 'map' THEN 'mapa' ELSE 'pizarra' END;
      UPDATE pins SET vistas = 299, autor_moderador = 'Equipo' WHERE id = 1;
      UPDATE pins SET vistas = 300 WHERE id = 2;
      INSERT INTO pins (seccion_id, surface, x, y, color, text, user_id, autor_moderador, vistas, created_at, updated_at)
        VALUES ('pizarra', 'board', 20, 20, 'verde', 'Nota histórica', 1, 'Equipo', 450, 2, 2);
      INSERT INTO replies (pin_id, text, user_id, autor_moderador, created_at) VALUES (3, 'Respuesta histórica', 1, 'Equipo', 3);
      UPDATE pins SET reply_count = 1 WHERE id = 3;
      INSERT INTO reports (target_type, target_id, user_id, created_at) VALUES ('pin', 3, 1, 4);
      INSERT INTO content_fts (text, author, institution, kind, ref_id, pin_id)
        VALUES ('Nota histórica', 'Equipo', 'Colegio ejemplo 1', 'pin', 3, 3);`);
    const insertar = previa.prepare('INSERT INTO pin_vistas VALUES (?, ?, ?)');
    previa.transaction(() => {
      for (const [id, cantidad] of [
        [1, 299],
        [2, 300],
        [3, 450],
      ] as const) {
        for (let n = 0; n < cantidad; n++) insertar.run(id, `visitante-${n}`, n);
      }
    })();
    const tablas = ['users', 'pins', 'replies', 'secciones', 'temas', 'reports', 'content_fts'];
    const antes = tablas.map((tabla) => previa.prepare(`SELECT * FROM ${tabla}`).all());
    const visitasVigentes = previa.prepare('SELECT * FROM pin_vistas WHERE pin_id = 1').all();
    previa.close();
    let migrada = openDatabase(archivo);
    try {
      expect(migrada.pragma('user_version', { simple: true })).toBe(6);
      for (const [indice, tabla] of tablas.entries()) {
        expect(migrada.prepare(`SELECT * FROM ${tabla}`).all()).toEqual(antes[indice]);
      }
      expect(migrada.prepare('SELECT * FROM pin_vistas').all()).toEqual(visitasVigentes);
      expect(
        migrada
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'pins_moderadores_visibles'",
          )
          .get(),
      ).toEqual({ name: 'pins_moderadores_visibles' });
      expect(migrada.pragma('foreign_key_check')).toEqual([]);
      migrada.close();
      migrada = openDatabase(archivo);
      expect(migrada.pragma('user_version', { simple: true })).toBe(6);
      expect(migrada.prepare('SELECT * FROM pin_vistas').all()).toEqual(visitasVigentes);
      expect(migrada.prepare('SELECT id, vistas FROM pins ORDER BY id').all()).toEqual([
        { id: 1, vistas: 299 },
        { id: 2, vistas: 300 },
        { id: 3, vistas: 450 },
      ]);
    } finally {
      migrada.close();
    }
  });
});
