import { BOARD_SIZE, MAP_HEIGHT, MAP_WIDTH, isInsideCampus, type Surface } from '@pizarra/shared';

export interface World {
  width: number;
  height: number;
  limites?: [[number, number], [number, number]];
  /** Extensión máxima visible al alejarse; no cambia las coordenadas del mapa. */
  vistaMaxima?: { ancho: number; alto: number };
}

/** Mundo de cada superficie: la pizarra es cuadrada; el mapa mide lo que mide el campus. */
export function worldOf(surface: Surface): World {
  return surface === 'map'
    ? {
        vistaMaxima: { ancho: 3300, alto: 1750 },
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        limites: [
          [-1830, -1830],
          [MAP_WIDTH + 1830, MAP_HEIGHT + 1830],
        ],
      }
    : { width: BOARD_SIZE, height: BOARD_SIZE };
}

/**
 * ¿Se puede poner un pin aquí? En la pizarra basta con estar dentro del lienzo; en el mapa,
 * dentro del contorno de la universidad. El servidor vuelve a comprobarlo.
 */
export function canPlaceAt(surface: Surface, x: number, y: number): boolean {
  if (surface === 'map') return isInsideCampus(x, y);
  const { width, height } = worldOf(surface);
  return x >= 0 && y >= 0 && x <= width && y <= height;
}
