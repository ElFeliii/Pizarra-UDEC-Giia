import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModReportItem, TargetType } from '@pizarra/shared';
import { MOD_PASSWORD, once, pinInput, startServer } from './helpers';

let servidor: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  servidor = await startServer({ MOD_USERS: `Mod Test:${MOD_PASSWORD}`, MOD_PASSWORD: '' });
});
afterEach(async () => {
  await servidor.close();
});

describe('reportes de avisos con firma auténtica de moderación', () => {
  it.each(['pin', 'reply'] as const)(
    'los reportes de %s siguen pendientes sin ocultar el aviso; moderación puede decidir',
    async (tipo) => {
      const cookie = await servidor.modLogin();
      const equipo = await servidor.connect((await servidor.newUser()).token, cookie);
      const padre = await equipo.emitWithAck('pin:create', pinInput('Información del equipo'));
      if (!padre.ok) throw new Error(padre.error.message);
      const respuesta = await equipo.emitWithAck('reply:create', {
        pinId: padre.data.id,
        text: 'Aclaración del equipo',
      });
      if (!respuesta.ok) throw new Error(respuesta.error.message);
      const id = tipo === 'pin' ? padre.data.id : respuesta.data.id;
      const repo = tipo === 'pin' ? servidor.ctx.repos.pins : servidor.ctx.repos.replies;
      expect(repo.get(id)?.autorModerador).toBe('Mod Test');

      for (let i = 0; i < 3; i++) {
        const reportador = await servidor.connect((await servidor.newUser()).token);
        const evento = once(equipo, 'mod:report');
        const resultado = await reportador.emitWithAck('report:create', {
          targetType: tipo,
          targetId: id,
          reason: 'Solicito que lo revise el equipo',
        });
        expect(resultado.ok).toBe(true);
        expect((await evento)[0]).toMatchObject({ type: tipo, id, autoHidden: false });
        await reportador.emitWithAck('report:create', { targetType: tipo, targetId: id });
      }
      expect(servidor.ctx.repos.reports.openCount(tipo, id)).toBe(3);
      expect(repo.get(id)?.hiddenAt).toBeNull();
      const cola = (
        await servidor.app.inject({ url: '/api/admin/reports', headers: { cookie } })
      ).json() as ModReportItem[];
      expect(cola).toContainEqual(
        expect.objectContaining({ type: tipo, id, reportCount: 3, hiddenAt: null }),
      );
      const hilo = (await servidor.app.inject(`/api/pins/${padre.data.id}/thread`)).json();
      expect(hilo.pin.autorModerador).toBe('Mod Test');
      expect(hilo.replies[0].autorModerador).toBe('Mod Test');

      const ocultado = await servidor.app.inject({
        method: 'POST',
        url: `/api/admin/content/${tipo}/${id}/hide`,
        headers: { cookie },
      });
      expect(ocultado.json()).toEqual({ changed: true });
      expect(repo.get(id)?.hiddenReason).toBe('mod');
      expect(servidor.ctx.repos.reports.openCount(tipo, id)).toBe(0);
      const restaurado = await servidor.app.inject({
        method: 'POST',
        url: `/api/admin/content/${tipo}/${id}/restore`,
        headers: { cookie },
      });
      expect(restaurado.json()).toEqual({ changed: true });
      expect(repo.get(id)?.hiddenAt).toBeNull();
      expect(repo.get(id)?.autorModerador).toBe('Mod Test');
    },
  );

  it.each(['pin', 'reply'] as const)(
    'copiar el nombre y la firma en JSON no protege %s del autoocultado',
    async (tipo: TargetType) => {
      const cookie = await servidor.modLogin();
      const equipo = await servidor.connect((await servidor.newUser()).token, cookie);
      const impostor = await servidor.connect((await servidor.newUser('Mod Test')).token);
      const padre = await (tipo === 'pin' ? impostor : equipo).emitWithAck('pin:create', {
        ...pinInput('Nota para revisar'),
        autorModerador: 'Mod Test',
      } as never);
      if (!padre.ok) throw new Error(padre.error.message);
      const respuesta = await impostor.emitWithAck('reply:create', {
        pinId: padre.data.id,
        text: 'Respuesta para revisar',
        autorModerador: 'Mod Test',
      } as never);
      if (!respuesta.ok) throw new Error(respuesta.error.message);
      const id = tipo === 'pin' ? padre.data.id : respuesta.data.id;
      const repo = tipo === 'pin' ? servidor.ctx.repos.pins : servidor.ctx.repos.replies;
      expect(repo.get(id)?.autorModerador).toBeNull();

      for (let i = 0; i < 3; i++) {
        const reportador = await servidor.connect((await servidor.newUser()).token);
        const resultado = await reportador.emitWithAck('report:create', {
          targetType: tipo,
          targetId: id,
        });
        expect(resultado.ok).toBe(true);
      }
      expect(servidor.ctx.repos.reports.openCount(tipo, id)).toBe(3);
      expect(repo.get(id)?.hiddenReason).toBe('reports');
      expect(repo.get(id)?.hiddenAt).not.toBeNull();
    },
  );
});
