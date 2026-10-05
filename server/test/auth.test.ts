import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { devModerators, loadConfig, parseModerators } from '../src/config';
import { authenticateModerator } from '../src/http/auth';

/** Los del evento llegan por MOD_USERS; acá se usa una lista de prueba equivalente. */
const moderadores = Array.from({ length: 10 }, (_, i) => ({
  name: `Moderador ${i + 1}`,
  password: `clave-de-prueba-${i + 1}`,
}));
const entra = (name: string, password: string, maestra = '') =>
  authenticateModerator(moderadores, maestra, name, password);

describe('moderadores', () => {
  it('en desarrollo hay algunos con la clave de desarrollo', () => {
    const dev = devModerators();
    expect(dev.length).toBeGreaterThan(0);
    expect(new Set(dev.map((m) => m.password)).size).toBe(1);
  });

  it('el código no trae ninguna credencial del evento', () => {
    // Si esto falla, alguien volvió a poner claves reales en el repositorio.
    const codigo = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
    const claves = codigo.match(/(['"`])\s*\d{4,}\s*/g) ?? [];
    expect(claves).toEqual([]);
  });
});

/** La clave de un moderador se lee de la lista: así no queda escrita en las pruebas. */
const clave = (n: number) => moderadores.find((m) => m.name === `Moderador ${n}`)!.password;

describe('login de moderador', () => {
  it('acepta el par correcto', () => {
    expect(entra('Moderador 3', clave(3))).toBe('Moderador 3');
    expect(entra('Moderador 10', clave(10))).toBe('Moderador 10');
  });

  it('no le sirve la clave de otro', () => {
    expect(entra('Moderador 3', clave(4))).toBeNull();
    expect(entra('Moderador 10', clave(1))).toBeNull();
  });

  it('rechaza nombres que no están en la lista', () => {
    expect(entra('intruso', clave(1))).toBeNull();
    expect(entra('', clave(1))).toBeNull();
  });

  it('el nombre se puede escribir con o sin espacios y en cualquier caja', () => {
    expect(entra('  moderador 2  ', clave(2))).toBe('Moderador 2');
    expect(entra('MODERADOR2', clave(2))).toBe('Moderador 2');
    expect(entra('Moderador2', clave(2))).toBe('Moderador 2');
    // La clave, en cambio, se compara tal cual.
    expect(entra('Moderador 2', ` ${clave(2)}`)).toBeNull();
  });

  it('la llave maestra sirve con cualquier nombre', () => {
    expect(entra('Camila de Rectoría', 'clave-larga-del-evento', 'clave-larga-del-evento')).toBe(
      'Camila de Rectoría',
    );
    expect(entra('Camila de Rectoría', 'otra', 'clave-larga-del-evento')).toBeNull();
  });

  it('sin llave maestra configurada, una clave vacía no abre nada', () => {
    expect(entra('Moderador 1', '')).toBeNull();
    expect(authenticateModerator([], '', 'quien sea', '')).toBeNull();
  });
});

describe('MOD_USERS', () => {
  it('lee la lista nombre:clave', () => {
    expect(parseModerators('ana:uno,juan:dos')).toEqual([
      { name: 'ana', password: 'uno' },
      { name: 'juan', password: 'dos' },
    ]);
  });

  it('descarta lo que viene mal y los nombres repetidos', () => {
    expect(parseModerators('ana:uno,sinclave,:x,ANA:otra, juan : dos ')).toEqual([
      { name: 'ana', password: 'uno' },
      { name: 'juan', password: 'dos' },
    ]);
  });

  it('acepta claves con dos puntos', () => {
    expect(parseModerators('ana:a:b:c')).toEqual([{ name: 'ana', password: 'a:b:c' }]);
  });
});

describe('secreto de sesión', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'pizarra-secreto-'));
  const dbPath = join(carpeta, 'pizarra.db');
  const base = {
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    CLIENT_DIST: '/no-existe',
    MOD_USERS: 'Moderador 1:clave-de-prueba',
  };

  it('en producción se genera y se guarda junto a la base', () => {
    const a = loadConfig(base);
    expect(a.sessionSecret.length).toBeGreaterThanOrEqual(32);
    expect(existsSync(join(carpeta, 'session-secret'))).toBe(true);
    // Al arrancar de nuevo se reutiliza: las sesiones sobreviven a un reinicio.
    expect(loadConfig(base).sessionSecret).toBe(a.sessionSecret);
  });

  it('la variable de entorno manda', () => {
    const mio = 'x'.repeat(40);
    expect(loadConfig({ ...base, SESSION_SECRET: mio }).sessionSecret).toBe(mio);
  });

  it('rechaza un secreto corto en producción', () => {
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'corto' })).toThrow(/32 caracteres/);
  });

  it('por omisión confía en un proxy del mismo servidor', () => {
    expect(loadConfig(base).trustProxy).toBe('loopback');
    expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
  });
});
