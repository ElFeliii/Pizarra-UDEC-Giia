import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer } from './helpers';

describe('parámetros del panel de moderación', () => {
  let servidor: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    servidor = await startServer();
  });
  afterEach(async () => {
    await servidor.close();
  });

  it.each(['/api/admin/feed?limit=501', '/api/admin/users?silenced=otro'])(
    'rechaza la consulta inválida sin convertirla en un error interno: %s',
    async (url) => {
      const cookie = await servidor.modLogin();
      const respuesta = await servidor.app.inject({ method: 'GET', url, headers: { cookie } });
      expect(respuesta.statusCode).toBe(400);
      expect(respuesta.json().error.code).toBe('VALIDATION');
    },
  );
});
