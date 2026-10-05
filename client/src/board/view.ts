import { ZOOM } from '@pizarra/shared';

/** Región del mundo que se renderiza (viewport + margen) y el zoom con que se calculó. */
export interface View {
  k: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Lod = 0 | 1 | 2;

export function lodFor(k: number): Lod {
  if (k < ZOOM.lodDot) return 0;
  if (k < ZOOM.lodLabel) return 1;
  return 2;
}

/** Margen extra alrededor del viewport, en fracción de su tamaño. */
const PAD = 0.5;
/** Recalcular si el zoom cambió más de este factor (≈10 %). */
const K_TOLERANCE = 0.1;

export function computeView(
  t: { x: number; y: number; k: number },
  width: number,
  height: number,
): View {
  const vx0 = -t.x / t.k;
  const vy0 = -t.y / t.k;
  const vw = width / t.k;
  const vh = height / t.k;
  return {
    k: t.k,
    x0: vx0 - vw * PAD,
    y0: vy0 - vh * PAD,
    x1: vx0 + vw * (1 + PAD),
    y1: vy0 + vh * (1 + PAD),
  };
}

/**
 * ¿Hace falta re-renderizar? Solo si el viewport salió de la región ya renderizada o el zoom
 * cambió lo suficiente. Así, desplazarse por la pizarra casi no provoca renders de React.
 */
export function needsUpdate(
  current: View,
  t: { x: number; y: number; k: number },
  width: number,
  height: number,
): boolean {
  if (Math.abs(Math.log(t.k / current.k)) > K_TOLERANCE) return true;
  if (lodFor(t.k) !== lodFor(current.k)) return true;
  const vx0 = -t.x / t.k;
  const vy0 = -t.y / t.k;
  return (
    vx0 < current.x0 ||
    vy0 < current.y0 ||
    vx0 + width / t.k > current.x1 ||
    vy0 + height / t.k > current.y1
  );
}
