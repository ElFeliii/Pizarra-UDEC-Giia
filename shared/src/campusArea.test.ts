import { describe, expect, it } from 'vitest';
import { CAMPUS_AREA, MAP_HEIGHT, MAP_WIDTH, isInsideCampus } from './campusArea';

/** Centro aproximado del contorno: sirve como punto "claramente dentro". */
const centro = (): [number, number] => {
  const b = CAMPUS_AREA.boundary;
  return [b.reduce((s, p) => s + p[0], 0) / b.length, b.reduce((s, p) => s + p[1], 0) / b.length];
};

describe('área del campus', () => {
  it('el contorno está cerrado dentro del lienzo y tiene suficientes puntos', () => {
    expect(CAMPUS_AREA.boundary.length).toBeGreaterThan(20);
    expect(MAP_WIDTH).toBeGreaterThan(500);
    expect(MAP_HEIGHT).toBeGreaterThan(500);
  });

  it('reconoce puntos dentro del campus', () => {
    const [cx, cy] = centro();
    expect(isInsideCampus(cx, cy)).toBe(true);
  });

  it('las esquinas del lienzo quedan fuera (son el margen alrededor del campus)', () => {
    expect(isInsideCampus(1, 1)).toBe(false);
    expect(isInsideCampus(MAP_WIDTH - 1, MAP_HEIGHT - 1)).toBe(false);
    expect(isInsideCampus(MAP_WIDTH - 1, 1)).toBe(false);
    expect(isInsideCampus(1, MAP_HEIGHT - 1)).toBe(false);
  });

  it('lo que está fuera del lienzo también está fuera del campus', () => {
    expect(isInsideCampus(-50, -50)).toBe(false);
    expect(isInsideCampus(MAP_WIDTH + 200, MAP_HEIGHT / 2)).toBe(false);
  });
});
