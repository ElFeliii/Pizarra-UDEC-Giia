import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, type AppContext } from '../src/context';
import { loadConfig, SERVER_ROOT } from '../src/config';
import { openDatabase, type DB } from '../src/db/db';
import { createPin, createReply } from '../src/services/content';
import { hideContent, reloadCensor, seedWordlist } from '../src/services/moderation';
import { seedSecciones } from '../src/services/secciones';
import { borrarContenido, borrarUsuario } from '../src/tools/datos';

const conexiones: DB[] = [];
const temporales: string[] = [];
afterEach(() => {
  for (const conexion of conexiones.splice(0)) if (conexion.open) conexion.close();
  for (const temporal of temporales.splice(0)) {
    if (
      dirname(resolve(temporal)) !== resolve(tmpdir()) ||
      !basename(temporal).startsWith('pizarra-retencion-palabras-')
    )
      throw new Error('La carpeta temporal no pertenece a esta prueba.');
    rmSync(temporal, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function contexto(ruta = ':memory:'): AppContext {
  const configuracion = loadConfig(
    {
      NODE_ENV: 'test',
      DB_PATH: ruta,
      SESSION_SECRET: 's'.repeat(40),
      CLIENT_DIST: '/no-existe',
      INSTITUTIONS_PATH: fileURLToPath(new URL('fixtures/instituciones.json', import.meta.url)),
    },
    [],
  );
  const ctx = createContext(configuracion);
  conexiones.push(ctx.db);
  seedSecciones(ctx, configuracion.seccionesPath);
  seedWordlist(ctx);
  reloadCensor(ctx);
  return ctx;
}

function carpetaTemporal(): string {
  const carpeta = mkdtempSync(join(tmpdir(), 'pizarra-retencion-palabras-'));
  temporales.push(carpeta);
  return carpeta;
}

/** Incluye contenido oculto y respuestas de ambos autores en hilos de la otra persona. */
async function poblar(ctx: AppContext) {
  const asistentes = ['Ana', 'Beto'].map((nombre, indice) =>
    ctx.repos.users.create({
      tokenHash: String(indice).repeat(64),
      name: nombre,
      institutionId: 'colegio-ejemplo-1',
      institutionName: 'Colegio ejemplo 1',
      ip: `192.0.2.${indice + 1}`,
      createdAt: ctx.now(),
    }),
  );
  const ana = asistentes[0]!;
  const beto = asistentes[1]!;
  const nota = async (id: number, texto: string) => {
    const resultado = await createPin(
      ctx,
      id,
      { surface: 'board', x: 100, y: 100, color: 'verde', text: texto },
      '192.0.2.30',
    );
    if (!resultado.ok) throw new Error(resultado.error.message);
    return resultado.data;
  };
  const responder = async (id: number, pinId: number, texto: string) => {
    const resultado = await createReply(ctx, id, { pinId, text: texto }, '192.0.2.30');
    if (!resultado.ok) throw new Error(resultado.error.message);
    return resultado.data;
  };
  const propio = await nota(ana.id, 'violeta');
  const ajeno = await nota(beto.id, 'jacaranda');
  const oculto = await nota(ana.id, 'hortensia');
  await responder(beto.id, propio.id, 'magnolia');
  await responder(ana.id, ajeno.id, 'jazmín');
  await responder(beto.id, ajeno.id, 'jacaranda');
  await responder(beto.id, oculto.id, 'lavanda');
  const respuestaOculta = await responder(ana.id, ajeno.id, 'azalea');
  hideContent(ctx, 'pin', oculto.id, 'Equipo ficticio', 'mod');
  hideContent(ctx, 'reply', respuestaOculta.id, 'Equipo ficticio', 'mod');
  return { ana, beto, propio, ajeno, oculto };
}

const supervivientes = [{ word: 'jacaranda', count: 2 }];
const rankingPersistido = (ctx: AppContext) =>
  ctx.db.prepare('SELECT display AS word, count FROM word_counts ORDER BY word').all();
const tablas = [
  'users',
  'pins',
  'replies',
  'reports',
  'pin_vistas',
  'content_fts',
  'word_counts',
  'app_meta',
];
const fotografiar = (ctx: AppContext) =>
  tablas.map((tabla) => ctx.db.prepare(`SELECT * FROM ${tabla}`).all());

describe('retención de palabras tras el mantenimiento administrativo', () => {
  it('borra del ranking notas propias y respuestas retiradas sin conservar texto oculto', async () => {
    const ctx = contexto();
    const { ana, ajeno } = await poblar(ctx);
    expect(ctx.topWords.takeChanged()).toEqual(
      expect.arrayContaining([
        { word: 'violeta', count: 1 },
        { word: 'magnolia', count: 1 },
        { word: 'jazmín', count: 1 },
      ]),
    );
    expect(borrarUsuario(ctx.db, ana.id)).toEqual({ pines: 2, respuestas: 4, usuarios: 1 });
    expect(rankingPersistido(ctx)).toEqual(supervivientes);
    expect(ctx.topWords.top()).toEqual(supervivientes);
    expect(ctx.topWords.takeChanged()).toEqual(supervivientes);
    expect(ctx.topWords.takeChanged()).toBeNull();
    expect(ctx.repos.pins.get(ajeno.id)?.replyCount).toBe(1);
    expect(ctx.db.pragma('foreign_key_check')).toEqual([]);
  });

  it('vaciar todo también invalida la caché caliente y difunde un ranking vacío', async () => {
    const ctx = contexto();
    await poblar(ctx);
    expect(ctx.topWords.takeChanged()!.length).toBeGreaterThan(0);
    borrarContenido(ctx.db);
    expect(rankingPersistido(ctx)).toEqual([]);
    expect(ctx.topWords.top()).toEqual([]);
    expect(ctx.topWords.takeChanged()).toEqual([]);
    expect(ctx.topWords.takeChanged()).toBeNull();
  });

  it.each(['usuario', 'contenido'] as const)(
    'un fallo del ranking revierte el borrado de %s y su señal de caché',
    async (tipo) => {
      const ctx = contexto();
      const { ana } = await poblar(ctx);
      const caliente = ctx.topWords.takeChanged();
      const antes = fotografiar(ctx);
      ctx.db.exec(
        "CREATE TRIGGER bloquear_ranking BEFORE DELETE ON word_counts BEGIN SELECT RAISE(ABORT, 'ranking bloqueado'); END",
      );
      expect(() =>
        tipo === 'usuario' ? borrarUsuario(ctx.db, ana.id) : borrarContenido(ctx.db),
      ).toThrow('ranking bloqueado');
      expect(fotografiar(ctx)).toEqual(antes);
      expect(ctx.topWords.top()).toEqual(caliente);
      expect(ctx.topWords.takeChanged()).toBeNull();
      expect(ctx.db.pragma('foreign_key_check')).toEqual([]);
    },
  );

  it.each(['usuario', 'contenido'] as const)(
    'otra conexión SQLite invalida el ranking caliente al borrar %s',
    async (tipo) => {
      const ruta = join(carpetaTemporal(), 'pizarra-ficticia.db');
      const ctx = contexto(ruta);
      const { ana } = await poblar(ctx);
      expect(ctx.topWords.takeChanged()!.length).toBeGreaterThan(0);
      const mantenimiento = openDatabase(ruta);
      conexiones.push(mantenimiento);
      if (tipo === 'usuario') borrarUsuario(mantenimiento, ana.id);
      else borrarContenido(mantenimiento);
      const esperado = tipo === 'usuario' ? supervivientes : [];
      expect(rankingPersistido(ctx)).toEqual(esperado);
      expect(ctx.topWords.top()).toEqual(esperado);
      expect(ctx.topWords.takeChanged()).toEqual(esperado);
      expect(ctx.topWords.takeChanged()).toBeNull();
    },
  );

  it('el CLI en otro proceso elimina palabras y renueva la caché sin leer configuración privada', async () => {
    const temporal = carpetaTemporal();
    const ruta = join(temporal, 'pizarra-ficticia.db');
    const ctx = contexto(ruta);
    const { ana } = await poblar(ctx);
    expect(ctx.topWords.takeChanged()!.length).toBeGreaterThan(0);
    writeFileSync(join(temporal, '.env'), '# entorno ficticio aislado sin credenciales\n');
    const resultado = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(resolve(SERVER_ROOT, '../node_modules/tsx/dist/loader.mjs')).href,
        resolve(SERVER_ROOT, 'src/tools/datos.ts'),
        '--db',
        ruta,
        '--borrar-usuario',
        String(ana.id),
        '--si',
      ],
      {
        cwd: temporal,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          MOD_USERS: '',
          MOD_PASSWORD: '',
          SESSION_SECRET: '',
        },
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(resultado.status, resultado.stderr).toBe(0);
    expect(resultado.stdout).toContain('Borrado Ana');
    expect(rankingPersistido(ctx)).toEqual(supervivientes);
    expect(ctx.topWords.top()).toEqual(supervivientes);
    expect(ctx.topWords.takeChanged()).toEqual(supervivientes);
  });

  it('las lecturas repetidas y la publicación habitual conservan el contador incremental', async () => {
    const ctx = contexto();
    await poblar(ctx);
    ctx.topWords.top();
    const textos = vi.spyOn(ctx.repos.wordCounts, 'textosVisibles');
    const consulta = vi.spyOn(ctx.repos.wordCounts, 'top');
    ctx.topWords.top();
    ctx.topWords.takeChanged();
    ctx.topWords.top();
    expect(consulta).not.toHaveBeenCalled();
    ctx.topWords.apply('araucaria', 1);
    expect(ctx.topWords.top()).toEqual(expect.arrayContaining([{ word: 'araucaria', count: 1 }]));
    expect(consulta).toHaveBeenCalledTimes(1);
    expect(textos).not.toHaveBeenCalled();
  });
});
