import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const base = {
  DB_PATH: ':memory:',
  CLIENT_DIST: '/no-existe',
  SESSION_SECRET: 's'.repeat(40),
  MOD_USERS: 'Moderación:clave-individual-ficticia',
};

describe('arranque seguro', () => {
  it('sin NODE_ENV usa producción y exige credenciales antes de crear el servidor', () => {
    expect(() => loadConfig({ DB_PATH: ':memory:' }, [])).toThrow(/Falta definir quién modera/);
    expect(loadConfig(base, []).env).toBe('production');
  });

  it('el proceso sin entorno ni credenciales termina con error en lugar de activar desarrollo', () => {
    const entorno: NodeJS.ProcessEnv = { DB_PATH: ':memory:', HOST: '127.0.0.1', PORT: '0' };
    for (const nombre of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
      const valor = process.env[nombre];
      if (valor) entorno[nombre] = valor;
    }
    // Se invoca la configuración directamente: no se consulta ningún .env local del equipo.
    const codigo = `const { loadConfig } = await import(${JSON.stringify(new URL('../src/config.ts', import.meta.url).href)}); loadConfig();`;
    const resultado = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', codigo],
      {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        env: entorno,
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(resultado.error).toBeUndefined();
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('Falta definir quién modera');
  });

  it('desarrollo requiere selección explícita y nunca activa la clave maestra por omisión', () => {
    const configuracion = loadConfig({ DB_PATH: ':memory:' }, ['--desarrollo']);
    expect(configuracion.env).toBe('development');
    expect(configuracion.host).toBe('127.0.0.1');
    expect(configuracion.moderators.length).toBeGreaterThan(0);
    expect(configuracion.modPassword).toBe('');
    expect(loadConfig({ NODE_ENV: 'development', DB_PATH: ':memory:' }, []).env).toBe(
      'development',
    );
  });

  it('el modo LAN y el puerto explícitos se conservan en desarrollo', () => {
    const configuracion = loadConfig({ DB_PATH: ':memory:' }, [
      '--desarrollo',
      '--lan',
      '--port',
      '3017',
    ]);
    expect(configuracion.host).toBe('0.0.0.0');
    expect(configuracion.port).toBe(3017);
  });

  it('la bandera de desarrollo no degrada un proceso expresamente configurado como producción', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' }, ['--desarrollo'])).toThrow(
      /incompatible/,
    );
  });

  it('conserva el entorno de pruebas explícito sin claves reales', () => {
    const configuracion = loadConfig({ NODE_ENV: 'test', DB_PATH: ':memory:' }, []);
    expect(configuracion.env).toBe('test');
    expect(configuracion.modPassword).toBe('');
  });

  it('reiniciar con credenciales rotadas invalida cookies anteriores aunque conserve el secreto', async () => {
    const credenciales = {
      ...base,
      NODE_ENV: 'test',
      MOD_USERS: 'Moderación:clave-anterior-ficticia',
    };
    const anterior = await buildApp(loadConfig(credenciales, []));
    let cookie: string;
    try {
      const acceso = await anterior.app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { moderatorName: 'Moderación', password: 'clave-anterior-ficticia' },
      });
      expect(acceso.statusCode).toBe(200);
      const cabecera = acceso.headers['set-cookie'];
      const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera;
      cookie = valor!.split(';')[0]!;
      expect(
        (await anterior.app.inject({ url: '/api/admin/me', headers: { cookie } })).statusCode,
      ).toBe(200);
    } finally {
      await anterior.app.close();
    }
    const nuevo = await buildApp(
      loadConfig({ ...credenciales, MOD_USERS: 'Moderación:clave-rotada-ficticia' }, []),
    );
    try {
      expect(
        (await nuevo.app.inject({ url: '/api/admin/me', headers: { cookie } })).statusCode,
      ).toBe(401);
      expect(
        (
          await nuevo.app.inject({
            method: 'POST',
            url: '/api/admin/login',
            payload: { moderatorName: 'Moderación', password: 'clave-anterior-ficticia' },
          })
        ).statusCode,
      ).toBe(401);
      const accesoNuevo = await nuevo.app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { moderatorName: 'Moderación', password: 'clave-rotada-ficticia' },
      });
      expect(accesoNuevo.statusCode).toBe(200);
      expect(accesoNuevo.json()).toEqual({ name: 'Moderación' });
    } finally {
      await nuevo.app.close();
    }
  });
});
