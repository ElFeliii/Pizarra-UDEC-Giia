import type { Ack } from '@pizarra/shared';
import { Manager } from 'socket.io-client';
import type { Socket as SocketServidor } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pinInput, startServer } from './helpers';

type Servidor = Awaited<ReturnType<typeof startServer>>;
type Transporte = 'websocket' | 'polling';
let servidor: Servidor;
let ahora: number;
const gestores: Manager[] = [];
const transportesServidor = new Set<SocketServidor['conn']>();

beforeEach(async () => {
  ahora = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => ahora);
  servidor = await startServer({ TRUST_PROXY: 'false' });
  servidor.io.engine.on('connection', (conexion: SocketServidor['conn']) => {
    transportesServidor.add(conexion);
    conexion.once('close', () => transportesServidor.delete(conexion));
  });
});

afterEach(async () => {
  const activos = gestores.splice(0);
  const cierres = activos
    .filter((gestor) => gestor.engine.readyState === 'open')
    .map(
      (gestor) => new Promise<void>((resolver) => gestor.engine.once('close', () => resolver())),
    );
  for (const conexion of transportesServidor) conexion.close();
  await Promise.all(cierres);
  for (const gestor of activos) gestor.engine.close();
  await servidor.close();
  vi.restoreAllMocks();
});
async function abrirTransporte(transporte: Transporte, cookie?: string): Promise<Manager> {
  const gestor = new Manager(servidor.url, {
    transports: [transporte],
    upgrade: false,
    autoConnect: false,
    reconnection: false,
    timeout: 1000,
    extraHeaders: cookie ? { cookie } : undefined,
  });
  gestores.push(gestor);
  await new Promise<void>((resolver, rechazar) => {
    gestor.open((error) => (error ? rechazar(error) : resolver()));
  });
  return gestor;
}

/** Engine.IO agrega su envoltura; se envían paquetes Socket.IO del namespace existente. */
function enviarYEsperar(
  gestor: Manager,
  paquete: string,
  prefijo: string | string[],
): Promise<string> {
  const opciones = Array.isArray(prefijo) ? prefijo : [prefijo];
  return new Promise((resolver, rechazar) => {
    const escuchar = (datos: unknown) => {
      const texto = String(datos);
      if (!opciones.some((opcion) => texto.startsWith(opcion))) return;
      clearTimeout(temporizador);
      gestor.engine.off('data', escuchar);
      resolver(texto);
    };
    const temporizador = setTimeout(() => {
      gestor.engine.off('data', escuchar);
      rechazar(new Error(`No llegó el paquete ${prefijo}.`));
    }, 1000);
    gestor.engine.on('data', escuchar);
    gestor.engine.write(paquete);
  });
}

async function conectarNamespace(gestor: Manager, token?: string): Promise<string> {
  const conectado = await enviarYEsperar(gestor, `0${JSON.stringify(token ? { token } : {})}`, '0');
  return (JSON.parse(conectado.slice(1)) as { sid: string }).sid;
}

async function desconectarNamespace(gestor: Manager, id: string): Promise<void> {
  const socket = servidor.io.sockets.sockets.get(id);
  if (!socket) throw new Error('No existe el namespace de la prueba.');
  const desconectado = new Promise<void>((resolver) => {
    socket.once('disconnect', () => resolver());
  });
  gestor.engine.write('1');
  await desconectado;
  expect(gestor.engine.readyState).toBe('open');
}

async function publicar(
  gestor: Manager,
  numero: number,
  texto: string,
  x = 100,
): Promise<Ack<unknown>> {
  const prefijo = `3${numero}`;
  const respuesta = await enviarYEsperar(
    gestor,
    `2${numero}${JSON.stringify(['pin:create', pinInput(texto, x, x)])}`,
    prefijo,
  );
  return (JSON.parse(respuesta.slice(prefijo.length)) as [Ack<unknown>])[0];
}

function abrirNotas(gestor: Manager, cantidad: number): void {
  for (let n = 0; n < cantidad; n++) {
    gestor.engine.write(`2${JSON.stringify(['thread:join', { pinId: 999999 }])}`);
  }
}

describe('presupuestos conservados al reconectar el namespace sobre Engine.IO', () => {
  it.each(['websocket', 'polling'] as const)(
    'frena CONNECT antes de SQLite sin cobrar dos veces el handshake inicial en %s',
    async (transporte) => {
      const consumos = vi.spyOn(servidor.ctx.limiters.conexionSocket, 'take');
      const gestor = await abrirTransporte(transporte);
      const id = await conectarNamespace(gestor, 'x'.repeat(43));
      const ip = servidor.io.sockets.sockets.get(id)!.data.ip;
      expect(consumos).toHaveBeenCalledTimes(1);
      await desconectarNamespace(gestor, id);
      while (servidor.ctx.limiters.conexionSocket.take(ip).ok) {
        /* Agota únicamente los tokens de esta fixture. */
      }
      const consulta = vi.spyOn(servidor.ctx.repos.users, 'findByTokenHash');
      const rechazo = await enviarYEsperar(
        gestor,
        `0${JSON.stringify({ token: 'x'.repeat(43) })}`,
        ['0', '4'],
      );
      expect(rechazo[0]).toBe('4');
      expect(JSON.parse(rechazo.slice(1))).toMatchObject({ data: { code: 'RATE_LIMITED' } });
      expect(consulta).not.toHaveBeenCalled();
      expect(servidor.io.engine.clientsCount).toBe(1);
      ahora += 100;
      await conectarNamespace(gestor, 'x'.repeat(43));
      expect(consulta).toHaveBeenCalledTimes(1);
      expect((await servidor.app.inject('/api/health')).statusCode).toBe(200);
    },
  );

  it.each(['websocket', 'polling'] as const)(
    'no renueva eventos ni rechazos al reconectar el namespace en %s',
    async (transporte) => {
      const gestor = await abrirTransporte(transporte);
      let id = await conectarNamespace(gestor);
      const consulta = vi.spyOn(servidor.ctx.repos.pins, 'get');
      abrirNotas(gestor, 58);
      expect(await publicar(gestor, 1, 'Primera barrera')).toMatchObject({
        ok: false,
        error: { code: 'NO_SESSION' },
      });
      await desconectarNamespace(gestor, id);
      id = await conectarNamespace(gestor);
      abrirNotas(gestor, 1);
      expect(await publicar(gestor, 2, 'Segunda barrera')).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      expect(consulta).toHaveBeenCalledTimes(59);
      await desconectarNamespace(gestor, id);
      await conectarNamespace(gestor);
      expect(await publicar(gestor, 3, 'Tercera barrera')).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED' },
      });
      const cerrado = new Promise<void>((resolver) => {
        gestor.engine.once('close', () => resolver());
      });
      gestor.engine.write(`2${JSON.stringify(['evento:ficticio'])}`);
      await cerrado;
      expect(gestor.engine.readyState).toBe('closed');
      expect(consulta).toHaveBeenCalledTimes(59);
      expect((await servidor.app.inject('/api/health')).statusCode).toBe(200);
    },
  );

  it('conserva presupuestos independientes para dos transportes legítimos', async () => {
    const primero = await abrirTransporte('websocket');
    const segundo = await abrirTransporte('polling');
    await conectarNamespace(primero);
    await conectarNamespace(segundo);
    for (const gestor of [primero, segundo]) {
      abrirNotas(gestor, 58);
      expect(await publicar(gestor, 1, 'Lectura legítima')).toMatchObject({
        ok: false,
        error: { code: 'NO_SESSION' },
      });
      expect(gestor.engine.readyState).toBe('open');
    }
  });

  it('revalida la firma de moderación al reconectar después de cerrar sesión', async () => {
    const usuario = await servidor.newUser();
    const cookie = await servidor.modLogin();
    const gestor = await abrirTransporte('websocket', cookie);
    const id = await conectarNamespace(gestor, usuario.token);
    expect(await publicar(gestor, 1, 'Aviso firmado')).toMatchObject({
      ok: true,
      data: { autorModerador: 'Mod Test' },
    });
    await desconectarNamespace(gestor, id);
    expect(
      (await servidor.app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    await conectarNamespace(gestor, usuario.token);
    expect(await publicar(gestor, 2, 'Nota después de cerrar sesión', 1000)).toMatchObject({
      ok: true,
      data: { autorModerador: null },
    });
  });
});
