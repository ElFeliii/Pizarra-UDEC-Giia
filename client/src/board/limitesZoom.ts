import { ZOOM } from '@pizarra/shared';
import type { World } from './world';

/** Evita mostrar una región mayor que la referencia, incluso al girar o ampliar la ventana. */
export function zoomMinimo(mundo: World, ancho: number, alto: number): number {
  if (!mundo.vistaMaxima) return ZOOM.min;
  return Math.min(
    ZOOM.max,
    Math.max(ZOOM.min, ancho / mundo.vistaMaxima.ancho, alto / mundo.vistaMaxima.alto),
  );
}

/** Las transformaciones programáticas de d3 no respetan scaleExtent por sí solas. */
export function limitarZoom(escala: number, mundo: World, ancho: number, alto: number): number {
  return Math.max(zoomMinimo(mundo, ancho, alto), Math.min(ZOOM.max, escala));
}

/** Conserva el centro de las notas al encuadrarlas, aunque el mapa impida alejarse más. */
export function encuadrarPines(
  pines: readonly { x: number; y: number }[],
  mundo: World,
  ancho: number,
  alto: number,
  minimo: number = ZOOM.min,
): { x: number; y: number; k: number } {
  if (pines.length < 3) {
    return {
      x: mundo.width / 2,
      y: mundo.height / 2,
      k: limitarZoom(Math.min(1, ancho / mundo.width, alto / mundo.height), mundo, ancho, alto),
    };
  }
  const x0 = Math.min(...pines.map((p) => p.x));
  const y0 = Math.min(...pines.map((p) => p.y));
  const x1 = Math.max(...pines.map((p) => p.x));
  const y1 = Math.max(...pines.map((p) => p.y));
  const escala = Math.min(ancho / (x1 - x0 + 320), alto / (y1 - y0 + 320));
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    k: limitarZoom(Math.min(1.2, Math.max(minimo, escala)), mundo, ancho, alto),
  };
}
