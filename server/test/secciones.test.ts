import type { Seccion } from '@pizarra/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { once, pinInput, startServer, type TestSocket } from './helpers';

type Servidor = Awaited<ReturnType<typeof startServer>>;

let s: Servidor;
let cookie: string;

const estado = async (id: string, valor: string) =>
  s.app.inject({
    method: 'POST',
    url: `/api/admin/secciones/${id}`,
    headers: { cookie },
    payload: { estado: valor },
  });

beforeAll(async () => {
  s = await startServer();
  cookie = await s.modLogin();
});
afterAll(async () => {
  await s.close();
});

describe('secciones', () => {
  it('la semilla deja las secciones del evento', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/secciones' });
    expect(res.statusCode).toBe(200);
    const secciones = res.json() as Seccion[];
    const ids = secciones.map((x) => x.id);
    expect(ids).toContain('pizarra');
    expect(ids).toContain('mapa');
    expect(ids).toContain('consejos');
    // Las ocultas no se le muestran al asistente.
    expect(ids).not.toContain('votaciones');
    expect(secciones).toEqual([...secciones].sort((a, b) => a.orden - b.orden));
  });

  it('con la sección cerrada el servidor rechaza publicar, aunque el cliente lo intente', async () => {
    const { token } = await s.newUser();
    const socket = await s.connect(token);

    const ok = await socket.emitWithAck('pin:create', pinInput('Antes de cerrar'));
    expect(ok.ok).toBe(true);

    expect((await estado('pizarra', 'solo_lectura')).statusCode).toBe(200);

    const cerrado = await socket.emitWithAck('pin:create', pinInput('Después de cerrar'));
    expect(cerrado.ok).toBe(false);
    if (!cerrado.ok) expect(cerrado.error.code).toBe('SECCION_CERRADA');

    // Y tampoco se puede responder a lo que ya existía.
    if (ok.ok) {
      const respuesta = await socket.emitWithAck('reply:create', {
        pinId: ok.data.id,
        text: 'Una respuesta tardía',
      });
      expect(respuesta.ok).toBe(false);
    }

    // Leer sigue funcionando: cerrada no es lo mismo que apagada.
    const lectura = await s.app.inject({ method: 'GET', url: '/api/pins?surface=board' });
    expect(lectura.statusCode).toBe(200);
    expect((lectura.json() as { pins: unknown[] }).pins.length).toBeGreaterThan(0);

    await estado('pizarra', 'abierta');
  });

  it('el cambio llega a los navegadores abiertos, sin recargar', async () => {
    const socket: TestSocket = await s.connect();
    const espera = once(socket, 'seccion:estado');
    await estado('consejos', 'solo_lectura');
    const [seccion] = await espera;
    expect(seccion).toMatchObject({ id: 'consejos', estado: 'solo_lectura' });
    await estado('consejos', 'abierta');
  });

  it('un momento completo se aplica de una vez', async () => {
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/admin/secciones/preset/puertas-abiertas',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { cambiadas } = res.json() as { cambiadas: Seccion[] };
    expect(cambiadas.length).toBeGreaterThan(0);

    const secciones = (
      await s.app.inject({ method: 'GET', url: '/api/secciones' })
    ).json() as Seccion[];
    const porId = new Map(secciones.map((x) => [x.id, x]));
    expect(porId.get('consejos')?.estado).toBe('solo_lectura');
    expect(porId.get('faq')?.estado).toBe('solo_lectura');
    // El mapa y la pizarra son justamente lo que se abre ese día.
    expect(porId.get('mapa')?.estado).toBe('abierta');
    expect(porId.get('pizarra')?.estado).toBe('abierta');
  });

  it('volver al modo universitarios reabre lo que se había cerrado', async () => {
    await s.app.inject({
      method: 'POST',
      url: '/api/admin/secciones/preset/universitarios',
      headers: { cookie },
    });
    const secciones = (
      await s.app.inject({ method: 'GET', url: '/api/secciones' })
    ).json() as Seccion[];
    expect(secciones.filter((x) => x.estado !== 'abierta')).toEqual([]);
  });

  it('solo el moderador puede abrir o cerrar', async () => {
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/admin/secciones/pizarra',
      payload: { estado: 'oculta' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rechaza estados y secciones que no existen', async () => {
    expect((await estado('pizarra', 'inventado')).statusCode).toBe(400);
    expect((await estado('no-existe', 'abierta')).statusCode).toBe(404);
  });
});
