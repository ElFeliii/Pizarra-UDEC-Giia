import { expect, it } from 'vitest';
import type { PinSummary } from '@pizarra/shared';
import { ordenarPines } from './orden';

it('una nota reciente o grande de asistente nunca tapa un aviso pequeño del equipo', () => {
  const equipo = { id: 1, autorModerador: 'Equipo', replyCount: 0, vistas: 0 } as PinSummary;
  const pequena = { id: 2, replyCount: 0, vistas: 0 } as PinSummary;
  const grande = { id: 3, replyCount: 1000, vistas: 1000 } as PinSummary;
  expect([equipo, pequena, grande].sort(ordenarPines).map((p) => p.id)).toEqual([3, 2, 1]);
});
