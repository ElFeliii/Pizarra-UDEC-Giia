import { describe, expect, it } from 'vitest';
import type { PinSummary } from './types';
import { invadeModeracion } from './espacioModeracion';

const oficial = {
  id: 1,
  x: 100,
  y: 100,
  surface: 'board',
  autorModerador: 'Equipo',
  replyCount: 0,
  vistas: 0,
} as PinSummary;
describe('espacio reservado a moderación', () => {
  it('admite un lugar próximo pero libre y rechaza el centro de una nota oficial', () => {
    expect(invadeModeracion({ surface: 'board', x: 100, y: 100 }, [oficial])).toBe(true);
    expect(invadeModeracion({ surface: 'board', x: 500, y: 100 }, [oficial])).toBe(false);
  });
  it('amplía la reserva cuando el aviso crece por visitas', () => {
    const nueva = { surface: 'board' as const, x: 350, y: 100 };
    expect(invadeModeracion(nueva, [oficial])).toBe(false);
    expect(invadeModeracion(nueva, [{ ...oficial, vistas: 10000 }])).toBe(true);
  });
  it('no reserva notas de asistentes ni de otra superficie', () => {
    expect(
      invadeModeracion({ surface: 'board', x: 100, y: 100 }, [
        { ...oficial, autorModerador: null },
      ]),
    ).toBe(false);
    expect(invadeModeracion({ surface: 'map', x: 100, y: 100 }, [oficial])).toBe(false);
  });
});
