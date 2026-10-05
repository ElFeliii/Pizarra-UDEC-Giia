/**
 * Control de la cámara de la pizarra. El Canvas registra la implementación; el resto de la
 * interfaz (búsqueda, poner pin, botones de zoom) la usa sin conocer d3.
 */
export interface Camera {
  flyTo(x: number, y: number, scale?: number): void;
  /** Punto del mundo que está en el centro de la pantalla. */
  center(): { x: number; y: number };
  zoomBy(factor: number): void;
  fitAll(): void;
  verEntorno(): void;
}

let impl: Camera | null = null;

export function registerCamera(c: Camera | null): void {
  impl = c;
}

export const camera: Camera = {
  flyTo: (x, y, scale) => impl?.flyTo(x, y, scale),
  center: () => impl?.center() ?? { x: 0, y: 0 },
  zoomBy: (f) => impl?.zoomBy(f),
  fitAll: () => impl?.fitAll(),
  verEntorno: () => impl?.verEntorno(),
};
