import { PESO, escalaNota } from '@pizarra/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config';
import { createContext, type AppContext } from '../src/context';

const contextos: AppContext[] = [];
afterEach(() => {
  for (const contexto of contextos.splice(0)) contexto.db.close();
});

function preparar() {
  const ctx = createContext(
    loadConfig({
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      MOD_PASSWORD: 'clave-de-prueba-123',
      SESSION_SECRET: 's'.repeat(40),
      CLIENT_DIST: '/no-existe',
      INSTITUTIONS_PATH: fileURLToPath(new URL('fixtures/instituciones.json', import.meta.url)),
    }),
  );
  contextos.push(ctx);
  const usuario = ctx.repos.users.create({
    tokenHash: 'a'.repeat(64),
    name: 'Ana',
    institutionId: 'colegio-ejemplo-1',
    institutionName: 'Colegio ejemplo 1',
    ip: null,
    createdAt: 1,
  });
  const crear = (
    seccion = 'pizarra',
    autorModerador: string | null = null,
    temaId: string | null = null,
  ) =>
    ctx.repos.pins.insert({
      seccion,
      temaId,
      autorModerador,
      surface: seccion === 'mapa' ? 'map' : 'board',
      x: 100,
      y: 100,
      color: 'verde',
      text: 'Una nota para mirar',
      userId: usuario.id,
      now: 1,
    });
  return { ctx, crear };
}

describe('visitas únicas acotadas por nota', () => {
  it('mantiene la deduplicación y no inserta visitantes después de 300', () => {
    const { ctx, crear } = preparar();
    const id = crear();
    for (let n = 0; n < PESO.maximo; n++) {
      expect(ctx.repos.pins.registrarVista(id, `visitante-${n}`, n)).toBe(n + 1);
      expect(ctx.repos.pins.registrarVista(id, `visitante-${n}`, n)).toBeNull();
    }
    for (let n = PESO.maximo; n < PESO.maximo + 1000; n++) {
      expect(ctx.repos.pins.registrarVista(id, `visitante-${n}`, n)).toBeNull();
    }
    expect(ctx.repos.pins.get(id)?.vistas).toBe(300);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM pin_vistas').get()).toEqual({ n: 300 });
    expect(escalaNota(0, ctx.repos.pins.get(id)?.vistas)).toBe(5);
    expect(ctx.db.pragma('foreign_key_check')).toEqual([]);
  });

  it('las respuestas no consumen el límite de visitas aunque la nota ya tenga tamaño máximo', () => {
    const { ctx, crear } = preparar();
    const id = crear();
    ctx.repos.pins.bumpReplyCount(id, 100, 2);
    expect(escalaNota(100, 0)).toBe(5);
    expect(ctx.repos.pins.registrarVista(id, 'primer-visitante', 3)).toBe(1);
    expect(ctx.repos.pins.registrarVista(id, 'primer-visitante', 4)).toBeNull();
    expect(ctx.repos.pins.get(id)).toMatchObject({ vistas: 1, replyCount: 100 });
  });

  it('conserva contadores históricos superiores al límite sin admitir nuevas filas', () => {
    const { ctx, crear } = preparar();
    const id = crear();
    ctx.db.prepare('UPDATE pins SET vistas = 450 WHERE id = ?').run(id);
    expect(ctx.repos.pins.registrarVista(id, 'visitante-posterior', 3)).toBeNull();
    expect(ctx.repos.pins.get(id)?.vistas).toBe(450);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM pin_vistas').get()).toEqual({ n: 0 });
  });

  it('no crea filas para una nota inexistente', () => {
    const { ctx } = preparar();
    expect(ctx.repos.pins.registrarVista(999999, 'visitante-anonimo', 1)).toBeNull();
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM pin_vistas').get()).toEqual({ n: 0 });
  });
});

describe('consulta de avisos firmados para reservar su espacio', () => {
  it('devuelve sólo avisos auténticos de la sección entre muchas notas de asistentes', () => {
    const { ctx, crear } = preparar();
    for (let n = 0; n < 500; n++) crear();
    const firmado = crear('pizarra', 'Equipo');
    const falso = crear();
    ctx.db.prepare('UPDATE users SET name = ?').run('Equipo');
    crear('mapa', 'Equipo');
    expect(ctx.repos.pins.listModeradoresVisibles('pizarra').map((nota) => nota.id)).toEqual([
      firmado,
    ]);
    expect(ctx.repos.pins.get(falso)?.autorModerador).toBeNull();
  });

  it('excluye avisos ocultos por nota, tema y sección', () => {
    const { ctx, crear } = preparar();
    const visible = crear('pizarra', 'Equipo');
    const oculto = crear('pizarra', 'Equipo');
    ctx.repos.pins.setHidden(oculto, 'Equipo', 'mod', 2);
    ctx.db
      .prepare("INSERT INTO temas VALUES ('tema-prueba', 'pizarra', 'Tema', NULL, NULL, 1, 1)")
      .run();
    crear('pizarra', 'Equipo', 'tema-prueba');
    expect(ctx.repos.pins.listModeradoresVisibles('pizarra').map((nota) => nota.id)).toEqual([
      visible,
    ]);
    ctx.db.prepare("UPDATE secciones SET estado = 'oculta' WHERE id = 'pizarra'").run();
    expect(ctx.repos.pins.listModeradoresVisibles('pizarra')).toEqual([]);
  });
});
