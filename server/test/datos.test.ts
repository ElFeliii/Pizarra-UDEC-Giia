import { describe, expect, it } from 'vitest';
import {
  anonimizarIps,
  borrarContenido,
  borrarUsuario,
  buscarUsuarios,
  resumen,
  resolverRutaDatos,
} from '../src/tools/datos';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, SERVER_ROOT } from '../src/config';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createContext } from '../src/context';

/** Contexto mínimo contra una base en memoria: no hace falta levantar el servidor. */
function makeContext() {
  return createContext(
    loadConfig({
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      MOD_PASSWORD: 'clave-de-prueba-123',
      SESSION_SECRET: 's'.repeat(40),
      CLIENT_DIST: '/no-existe',
      INSTITUTIONS_PATH: fileURLToPath(new URL('fixtures/instituciones.json', import.meta.url)),
    }),
  );
}

/** Base con dos asistentes: uno con un pin respondido por el otro. */
function poblar() {
  const ctx = makeContext();
  const ana = ctx.repos.users.create({
    tokenHash: 'a'.repeat(64),
    name: 'Ana',
    institutionId: 'colegio-ejemplo-1',
    institutionName: 'Colegio ejemplo 1',
    ip: '192.0.2.1',
    createdAt: ctx.now(),
  });
  const beto = ctx.repos.users.create({
    tokenHash: 'b'.repeat(64),
    name: 'Beto',
    institutionId: 'colegio-ejemplo-1',
    institutionName: 'Colegio ejemplo 1',
    ip: '192.0.2.2',
    createdAt: ctx.now(),
  });
  const pin = ctx.repos.pins.insert({
    seccion: 'pizarra',
    surface: 'board',
    x: 100,
    y: 100,
    color: 'rojo',
    text: '¿Dónde queda el campanil?',
    userId: ana.id,
    now: ctx.now(),
  });
  ctx.repos.search.index({
    kind: 'pin',
    refId: pin,
    pinId: pin,
    text: '¿Dónde queda el campanil?',
    author: 'Ana',
    institution: 'Colegio ejemplo 1',
  });
  const respuesta = ctx.repos.replies.insert({
    pinId: pin,
    text: 'Al centro del campus',
    userId: beto.id,
    now: ctx.now(),
  });
  ctx.repos.pins.bumpReplyCount(pin, 1, ctx.now());
  ctx.repos.search.index({
    kind: 'reply',
    refId: respuesta,
    pinId: pin,
    text: 'Al centro del campus',
    author: 'Beto',
    institution: 'Colegio ejemplo 1',
  });
  return { ctx, ana, beto, pin };
}

describe('herramienta de datos', () => {
  it('cuenta lo que hay guardado', () => {
    const { ctx } = poblar();
    const r = resumen(ctx.db);
    expect(r).toMatchObject({ usuarios: 2, conIp: 2, pines: 1, respuestas: 1, reportes: 0 });
    expect(r.primero).not.toBeNull();
  });

  it('borra las IP sin tocar los mensajes', () => {
    const { ctx } = poblar();
    expect(anonimizarIps(ctx.db)).toBe(2);
    const r = resumen(ctx.db);
    expect(r.conIp).toBe(0);
    expect(r.usuarios).toBe(2);
    expect(r.pines).toBe(1);
    expect(r.respuestas).toBe(1);
    // Correrlo dos veces no cambia nada.
    expect(anonimizarIps(ctx.db)).toBe(0);
  });

  it('busca asistentes por id y por nombre', () => {
    const { ctx, ana } = poblar();
    expect(buscarUsuarios(ctx.db, String(ana.id))).toEqual([{ id: ana.id, name: 'Ana' }]);
    expect(buscarUsuarios(ctx.db, 'ana')).toEqual([{ id: ana.id, name: 'Ana' }]);
    expect(buscarUsuarios(ctx.db, 'nadie')).toEqual([]);
  });

  it('borrar a una persona se lleva su pin y las respuestas que recibió', () => {
    const { ctx, ana } = poblar();
    const b = borrarUsuario(ctx.db, ana.id);
    expect(b).toEqual({ pines: 1, respuestas: 1, usuarios: 1 });
    const r = resumen(ctx.db);
    expect(r).toMatchObject({ usuarios: 1, pines: 0, respuestas: 0 });
    // El índice de búsqueda queda limpio: lo borrado no se puede encontrar.
    expect(ctx.repos.search.search('campanil', 'board')).toEqual([]);
  });

  it('borrar el contenido deja la base vacía pero conserva la lista de palabras', () => {
    const { ctx } = poblar();
    const palabras = ctx.repos.bannedWords.list().length;
    const b = borrarContenido(ctx.db);
    expect(b).toEqual({ pines: 1, respuestas: 1, usuarios: 2 });
    expect(resumen(ctx.db)).toMatchObject({ usuarios: 0, pines: 0, respuestas: 0, reportes: 0 });
    expect(ctx.repos.bannedWords.list().length).toBe(palabras);
  });
});

describe('borrado con visitas y dependencias existentes', () => {
  function agregarDependencias() {
    const base = poblar();
    const { ctx, ana, beto, pin } = base;
    const otroPin = ctx.repos.pins.insert({
      seccion: 'pizarra',
      surface: 'board',
      x: 200,
      y: 200,
      color: 'verde',
      text: 'Biblioteca independiente',
      userId: beto.id,
      now: 4,
    });
    ctx.repos.search.index({
      kind: 'pin',
      refId: otroPin,
      pinId: otroPin,
      text: 'Biblioteca independiente',
      author: 'Beto',
      institution: 'Colegio ejemplo 1',
    });
    const respuestaPropia = ctx.repos.replies.insert({
      pinId: otroPin,
      text: 'Respuesta para retirar',
      userId: ana.id,
      now: 5,
    });
    const respuestaAjena = ctx.repos.replies.insert({
      pinId: otroPin,
      text: 'Respuesta independiente',
      userId: beto.id,
      now: 6,
    });
    ctx.repos.pins.bumpReplyCount(otroPin, 2, 6);
    for (const [id, text, author] of [
      [respuestaPropia, 'Respuesta para retirar', 'Ana'],
      [respuestaAjena, 'Respuesta independiente', 'Beto'],
    ] as const) {
      ctx.repos.search.index({
        kind: 'reply',
        refId: id,
        pinId: otroPin,
        text,
        author,
        institution: 'Colegio ejemplo 1',
      });
    }
    const primeraRespuesta = ctx.repos.replies.listVisibleByPin(pin)[0]!.id;
    ctx.repos.reports.add('pin', pin, beto.id, 'Reporte de la nota que se borra', 7);
    ctx.repos.reports.add(
      'reply',
      primeraRespuesta,
      beto.id,
      'Reporte de respuesta del hilo que se borra',
      7,
    );
    ctx.repos.reports.add(
      'reply',
      respuestaPropia,
      beto.id,
      'Reporte de respuesta que se borra',
      7,
    );
    ctx.repos.reports.add('reply', respuestaAjena, beto.id, 'Reporte que se conserva', 7);
    ctx.repos.reports.add('pin', otroPin, ana.id, 'Reporte creado por quien se borra', 7);
    ctx.repos.pins.registrarVista(pin, 'visitante-primero', 8);
    ctx.repos.pins.registrarVista(otroPin, 'visitante-segundo', 8);
    return { ...base, otroPin, respuestaAjena };
  }

  it('borra un usuario con sus visitas, reportes e índice, conservando el contenido ajeno', () => {
    const { ctx, ana, beto, otroPin, respuestaAjena } = agregarDependencias();
    try {
      expect(borrarUsuario(ctx.db, ana.id)).toEqual({ pines: 1, respuestas: 2, usuarios: 1 });
      expect(ctx.repos.users.findById(beto.id)).toBeDefined();
      expect(ctx.repos.pins.get(otroPin)).toMatchObject({ replyCount: 1, vistas: 1 });
      expect(ctx.repos.replies.listVisibleByPin(otroPin).map((respuesta) => respuesta.id)).toEqual([
        respuestaAjena,
      ]);
      expect(ctx.db.prepare('SELECT * FROM pin_vistas').all()).toEqual([
        { pin_id: otroPin, visitante: 'visitante-segundo', created_at: 8 },
      ]);
      expect(ctx.db.prepare('SELECT target_type, target_id FROM reports').all()).toEqual([
        { target_type: 'reply', target_id: respuestaAjena },
      ]);
      expect(
        ctx.db.prepare('SELECT kind, ref_id, pin_id FROM content_fts ORDER BY kind, ref_id').all(),
      ).toEqual([
        { kind: 'pin', ref_id: otroPin, pin_id: otroPin },
        { kind: 'reply', ref_id: respuestaAjena, pin_id: otroPin },
      ]);
      expect(ctx.repos.search.search('retirar', 'pizarra')).toEqual([]);
      expect(ctx.repos.search.search('independiente', 'pizarra')).toHaveLength(2);
      expect(ctx.db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      ctx.db.close();
    }
  });

  it('vacía notas visitadas conservando configuración y registro de moderación', () => {
    const { ctx } = agregarDependencias();
    const palabras = ctx.repos.bannedWords.list();
    ctx.db
      .prepare("INSERT INTO mod_log (moderator, action, created_at) VALUES ('Equipo', 'prueba', 9)")
      .run();
    const secciones = ctx.db.prepare('SELECT * FROM secciones').all();
    const temas = ctx.db.prepare('SELECT * FROM temas').all();
    try {
      expect(borrarContenido(ctx.db)).toEqual({ pines: 2, respuestas: 3, usuarios: 2 });
      for (const tabla of [
        'users',
        'pins',
        'replies',
        'reports',
        'pin_vistas',
        'content_fts',
        'word_counts',
      ]) {
        expect(ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get()).toEqual({ n: 0 });
      }
      expect(ctx.db.prepare('SELECT * FROM secciones').all()).toEqual(secciones);
      expect(ctx.db.prepare('SELECT * FROM temas').all()).toEqual(temas);
      expect(ctx.repos.bannedWords.list()).toEqual(palabras);
      expect(ctx.db.prepare('SELECT action FROM mod_log').all()).toEqual([{ action: 'prueba' }]);
      expect(ctx.db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      ctx.db.close();
    }
  });

  it('revierte toda la eliminación si falla el paso final de la transacción', () => {
    const { ctx, ana } = agregarDependencias();
    const tablas = ['users', 'pins', 'replies', 'reports', 'pin_vistas', 'content_fts'];
    const antes = tablas.map((tabla) => ctx.db.prepare(`SELECT * FROM ${tabla}`).all());
    ctx.db.exec(`CREATE TRIGGER bloquear_borrado BEFORE DELETE ON users WHEN OLD.id = ${ana.id}
      BEGIN SELECT RAISE(ABORT, 'borrado bloqueado'); END`);
    try {
      expect(() => borrarUsuario(ctx.db, ana.id)).toThrow('borrado bloqueado');
      for (const [indice, tabla] of tablas.entries()) {
        expect(ctx.db.prepare(`SELECT * FROM ${tabla}`).all()).toEqual(antes[indice]);
      }
      expect(ctx.db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      ctx.db.close();
    }
  });
});

describe('ruta de la herramienta administrativa sin claves de servidor', () => {
  it('prioriza --db sobre la ruta del entorno', () => {
    expect(resolverRutaDatos(':memory:', { DB_PATH: 'otra-base.db' })).toBe(':memory:');
  });
  it('respeta DB_PATH sin exigir credenciales ni crear un secreto de sesión', () => {
    expect(
      resolverRutaDatos(undefined, { NODE_ENV: 'production', DB_PATH: 'base-ficticia.db' }),
    ).toBe('base-ficticia.db');
  });
  it('resuelve la misma ubicación predeterminada de datos que el servidor', () => {
    expect(resolverRutaDatos(undefined, {})).toBe(resolve(SERVER_ROOT, '../data/pizarra.db'));
  });
});

describe('ejecución de mantenimiento sin login ni servidor', () => {
  it('consulta una base ficticia en producción sin claves ni secreto de sesión', () => {
    const temporal = mkdtempSync(join(tmpdir(), 'pizarra-datos-ficticios-'));
    try {
      // Impide que loadDotEnv busque el archivo privado de la instalación original.
      writeFileSync(join(temporal, '.env'), '# configuración ficticia sin credenciales\n');
      const salida = spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(resolve(SERVER_ROOT, '../node_modules/tsx/dist/loader.mjs')).href,
          resolve(SERVER_ROOT, 'src/tools/datos.ts'),
          '--resumen',
        ],
        {
          cwd: temporal,
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_ENV: 'production',
            DB_PATH: join(temporal, 'pizarra.db'),
            MOD_USERS: '',
            MOD_PASSWORD: '',
            SESSION_SECRET: '',
          },
        },
      );
      expect(salida.status, salida.stderr).toBe(0);
      expect(salida.stdout).toContain('Asistentes:   0');
      expect(existsSync(join(temporal, 'session-secret'))).toBe(false);
    } finally {
      rmSync(temporal, { recursive: true, force: true });
    }
  });
});
