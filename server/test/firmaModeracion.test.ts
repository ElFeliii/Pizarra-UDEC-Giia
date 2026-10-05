import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAMPUS_AREA, type PinSummary } from '@pizarra/shared';
import { startServer, pinInput, once } from './helpers';

let servidor: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  servidor = await startServer();
});
afterEach(async () => {
  await servidor.close();
});

describe('firma verificada del equipo', () => {
  it('copiar el nombre o mandar autorModerador en el JSON no concede una corona', async () => {
    const usuario = await servidor.newUser('Mod Test');
    const socket = await servidor.connect(usuario.token);
    const respuesta = await socket.emitWithAck('pin:create', {
      ...pinInput('Soy un asistente'),
      autorModerador: 'Mod Test',
    } as never);
    expect(respuesta.ok).toBe(true);
    if (respuesta.ok) expect(respuesta.data.autorModerador).toBeNull();
  });

  it('el pin y la respuesta conservan la firma después de cerrar la sesión del moderador', async () => {
    const usuario = await servidor.newUser('Nombre de asistente');
    const cookie = await servidor.modLogin();
    const socket = await servidor.connect(usuario.token, cookie);
    const observador = await servidor.connect();
    const evento = once(observador, 'pin:created');
    const pin = await socket.emitWithAck('pin:create', pinInput('Mensaje del equipo'));
    expect(pin.ok).toBe(true);
    if (!pin.ok) return;
    expect(pin.data.authorName).toBe('Mod Test');
    expect((await evento)[0].autorModerador).toBe('Mod Test');
    const respuesta = await socket.emitWithAck('reply:create', {
      pinId: pin.data.id,
      text: 'Respuesta del equipo',
    });
    expect(respuesta.ok).toBe(true);
    if (respuesta.ok) expect(respuesta.data.autorModerador).toBe('Mod Test');
    await servidor.app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie } });
    const despues = await socket.emitWithAck(
      'pin:create',
      pinInput('Ya cerré la sesión', 800, 800),
    );
    expect(despues.ok).toBe(true);
    if (despues.ok) expect(despues.data.autorModerador).toBeNull();
    const hilo = (await servidor.app.inject(`/api/pins/${pin.data.id}/thread`)).json();
    expect(hilo.pin.autorModerador).toBe('Mod Test');
    expect(hilo.replies[0].autorModerador).toBe('Mod Test');
    const listado = (await servidor.app.inject('/api/pins?seccion=pizarra')).json();
    expect(listado.pins.find((p: PinSummary) => p.id === pin.data.id).autorModerador).toBe(
      'Mod Test',
    );
  });

  it.each(['consejos', 'historias', 'carreras', 'faq'])(
    'la firma acompaña las notas y respuestas de %s',
    async (seccion) => {
      const usuario = await servidor.newUser();
      const cookie = await servidor.modLogin();
      const socket = await servidor.connect(usuario.token, cookie);
      servidor.ctx.db.prepare("UPDATE secciones SET estado = 'abierta' WHERE id = ?").run(seccion);
      let temaId: string | undefined;
      if (seccion === 'carreras')
        temaId = (
          servidor.ctx.db
            .prepare("SELECT id FROM temas WHERE seccion_id = 'carreras' LIMIT 1")
            .get() as { id: string }
        ).id;
      if (seccion === 'faq') {
        servidor.ctx.db.exec(
          "INSERT INTO temas VALUES ('faq-prueba', 'faq', 'Pregunta del equipo', NULL, NULL, 1, 0)",
        );
        temaId = 'faq-prueba';
      }
      const nota = await socket.emitWithAck('nota:create', {
        seccion,
        temaId,
        color: 'verde',
        text: 'Información de moderación',
      });
      expect(nota.ok).toBe(true);
      if (!nota.ok) return;
      expect(nota.data.autorModerador).toBe('Mod Test');
      const respuesta = await socket.emitWithAck('reply:create', {
        pinId: nota.data.id,
        text: 'Aclaración del equipo',
      });
      expect(respuesta.ok).toBe(true);
      if (respuesta.ok) expect(respuesta.data.autorModerador).toBe('Mod Test');
    },
  );

  it('reserva el espacio de las notas del equipo en pizarra y mapa, también desde el servidor', async () => {
    const usuario = await servidor.newUser();
    const mod = await servidor.connect(usuario.token, await servidor.modLogin());
    const normal = await servidor.connect((await servidor.newUser()).token);
    const [x, y] = CAMPUS_AREA.boundary.reduce(
      ([sx, sy], [px, py]) => [
        sx + px / CAMPUS_AREA.boundary.length,
        sy + py / CAMPUS_AREA.boundary.length,
      ],
      [0, 0],
    );
    for (const surface of ['board', 'map'] as const) {
      const pin = await mod.emitWithAck('pin:create', {
        surface,
        x,
        y,
        color: 'verde',
        text: `Aviso del equipo en ${surface}`,
      });
      expect(pin.ok).toBe(true);
      const tapado = await normal.emitWithAck('pin:create', {
        surface,
        x,
        y,
        color: 'azul',
        text: `Nota superpuesta en ${surface}`,
      });
      expect(tapado.ok).toBe(false);
      if (!tapado.ok) expect(tapado.error.message).toContain('reservado');
    }
  });

  it('la firma no evita el filtro ni permite publicar en secciones cerradas', async () => {
    const usuario = await servidor.newUser();
    const socket = await servidor.connect(usuario.token, await servidor.modLogin());
    const insulto = await socket.emitWithAck('pin:create', pinInput('imbecil'));
    expect(insulto.ok).toBe(false);
    if (!insulto.ok) expect(insulto.error.code).toBe('CENSORED');
    servidor.ctx.db.exec("UPDATE secciones SET estado = 'solo_lectura' WHERE id = 'pizarra'");
    const cerrado = await socket.emitWithAck('pin:create', pinInput('Mensaje válido'));
    expect(cerrado.ok).toBe(false);
    if (!cerrado.ok) expect(cerrado.error.code).toBe('SECCION_CERRADA');
  });
});
