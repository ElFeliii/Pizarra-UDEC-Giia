import area from './campus-area.json';

/**
 * Área de la universidad: el contorno oficial del campus (de OpenStreetMap) en coordenadas del
 * mapa, en metros. Se genera con `npm run mapa`.
 *
 * Sirve para dos cosas: dibujar el límite y decidir dónde se puede poner un pin. Lo usan tanto
 * el cliente (para avisar antes de enviar) como el servidor (que es quien manda).
 */
export interface CampusArea {
  width: number;
  height: number;
  boundary: [number, number][];
}

export const CAMPUS_AREA = area as CampusArea;

/** Tamaño del lienzo del mapa, en metros. */
export const MAP_WIDTH = CAMPUS_AREA.width;
export const MAP_HEIGHT = CAMPUS_AREA.height;

export const OUTSIDE_CAMPUS_MESSAGE = 'No puedes poner un pin fuera de la universidad.';

/**
 * ¿El punto está dentro del campus? Algoritmo del rayo: se cuenta cuántas veces una línea
 * horizontal hacia la derecha cruza el contorno; si es impar, el punto está dentro.
 */
export function isInsideCampus(x: number, y: number): boolean {
  const pts = CAMPUS_AREA.boundary;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (cruza) inside = !inside;
  }
  return inside;
}
