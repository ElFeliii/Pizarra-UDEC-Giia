import { describe, expect, it } from 'vitest';
import {
  anonimizarIps,
  borrarContenido,
  borrarUsuario,
  buscarUsuarios,
  resumen,
} from '../src/tools/datos';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config';
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
