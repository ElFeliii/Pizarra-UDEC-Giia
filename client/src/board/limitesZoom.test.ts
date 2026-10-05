import { describe, expect, it } from 'vitest';
import { encuadrarPines, limitarZoom, zoomMinimo } from './limitesZoom';
import { worldOf } from './world';

describe('alejamiento máximo del mapa', () => {
  it.each([
    [1891, 999],
    [1280, 720],
    [390, 844],
    [844, 390],
  ])('no muestra más de 3300 por 1750 metros en una pantalla de %s por %s', (ancho, alto) => {
    const minimo = zoomMinimo(worldOf('map'), ancho, alto);
    expect(ancho / minimo).toBeLessThanOrEqual(3300 + 1e-8);
    expect(alto / minimo).toBeLessThanOrEqual(1750 + 1e-8);
    expect(limitarZoom(0.1, worldOf('map'), ancho, alto)).toBe(minimo);
  });
  it('corrige la escala al ampliar o girar la pantalla y permite acercarse', () => {
    const mapa = worldOf('map');
    const anterior = zoomMinimo(mapa, 844, 390);
    expect(limitarZoom(anterior, mapa, 390, 844)).toBeGreaterThan(anterior);
    expect(limitarZoom(2, mapa, 390, 844)).toBe(2);
    expect(limitarZoom(20, mapa, 390, 844)).toBe(4);
  });
  it('mantiene el alejamiento existente de la pizarra', () => {
    expect(zoomMinimo(worldOf('board'), 1891, 999)).toBe(0.1);
    expect(limitarZoom(0.01, worldOf('board'), 1891, 999)).toBe(0.1);
  });
});

describe('encuadre automático con límite de zoom', () => {
  it('mantiene el foco sobre las notas de la pizarra, aunque estén lejos del centro del lienzo', () => {
    const vista = encuadrarPines(
      [
        { x: 100, y: 200 },
        { x: 300, y: 400 },
        { x: 200, y: 350 },
      ],
      worldOf('board'),
      1280,
      720,
    );
    expect(vista.x).toBe(200);
    expect(vista.y).toBe(300);
    expect(vista.k).toBe(1.2);
  });
  it('respeta el alejamiento máximo al encuadrar notas extendidas por el campus', () => {
    const mundo = worldOf('map');
    const vista = encuadrarPines(
      [
        { x: 0, y: 0 },
        { x: 1000, y: 1400 },
        { x: 200, y: 500 },
      ],
      mundo,
      390,
      844,
    );
    expect(vista.x).toBe(500);
    expect(vista.y).toBe(700);
    expect(vista.k).toBe(zoomMinimo(mundo, 390, 844));
  });
  it('aplica el mismo límite a una vista sin pines', () => {
    const mundo = worldOf('map');
    expect(encuadrarPines([], mundo, 390, 844).k).toBeGreaterThanOrEqual(
      zoomMinimo(mundo, 390, 844),
    );
  });
});
