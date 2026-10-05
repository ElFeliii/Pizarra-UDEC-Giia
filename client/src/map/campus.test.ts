import { BOARD_SIZE, CAMPUS_AREA, MAP_HEIGHT, MAP_WIDTH } from '@pizarra/shared';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_INFO, campus } from './campus';

describe('datos del mapa', () => {
  it('el lienzo empieza en 0, coincide con el área del campus y cabe en las coordenadas de un pin', () => {
    const [x, y, w, h] = campus.viewBox;
    expect([x, y]).toEqual([0, 0]);
    expect([w, h]).toEqual(campus.world);
    expect([w, h]).toEqual([MAP_WIDTH, MAP_HEIGHT]);
    // Un pin puesto en el mapa se valida con las mismas reglas que en la pizarra.
    expect(Math.max(w, h)).toBeLessThanOrEqual(BOARD_SIZE);
  });

  it('el contorno del campus cabe dentro del lienzo', () => {
    for (const [bx, by] of CAMPUS_AREA.boundary) {
      expect(bx).toBeGreaterThanOrEqual(0);
      expect(bx).toBeLessThanOrEqual(MAP_WIDTH);
      expect(by).toBeGreaterThanOrEqual(0);
      expect(by).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  it('todas las formas caen dentro de tipos conocidos', () => {
    const kinds = new Set(campus.features.map((f) => f.k));
    expect([...kinds].sort()).toEqual(['agua', 'calle', 'edificio', 'sendero', 'verde']);
  });

  it('los edificios con nombre tienen id único y centro dentro del lienzo', () => {
    const ids = campus.buildings.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of campus.buildings) {
      expect(b.cx).toBeGreaterThanOrEqual(0);
      expect(b.cx).toBeLessThanOrEqual(MAP_WIDTH);
      expect(b.cy).toBeGreaterThanOrEqual(0);
      expect(b.cy).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  it('incluye la atribución de OpenStreetMap', () => {
    expect(campus.attribution).toMatch(/OpenStreetMap/);
  });
});

describe('fichas de edificios', () => {
  it('cada ficha corresponde a un edificio existente del mapa', () => {
    for (const id of Object.keys(BUILDING_INFO)) {
      expect(BUILDINGS.has(id), `"${id}" no existe en campus.json`).toBe(true);
    }
  });

  it('la Biblioteca Central tiene ficha (es la que se puede abrir hoy)', () => {
    const id = 'edificio-biblioteca-central-luis-david-cruz-ocampo';
    expect(BUILDINGS.get(id)?.name).toContain('Biblioteca Central');
    expect(BUILDING_INFO[id]).toBeDefined();
  });

  it('las fichas declaran descripción y fotos aunque estén vacías', () => {
    for (const info of Object.values(BUILDING_INFO)) {
      expect(typeof info.descripcion).toBe('string');
      expect(Array.isArray(info.fotos)).toBe(true);
    }
  });
});
