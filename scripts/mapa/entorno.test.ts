import { describe, expect, it } from 'vitest';
import { buildCampusMap, type OsmWay } from './osm';
import { construirEntorno } from './entorno';
import campus from '../../client/src/map/campus.json';
import area from '../../shared/src/campus-area.json';
import entorno from '../../client/src/map/entorno.json';

const centro: [number, number] = [-73.0364, -36.829];
const contorno: OsmWay = {
  type: 'way',
  id: 1,
  geometry: [
    { lon: centro[0], lat: centro[1] },
    { lon: centro[0] + 0.005, lat: centro[1] },
    { lon: centro[0] + 0.005, lat: centro[1] - 0.005 },
    { lon: centro[0], lat: centro[1] - 0.005 },
    { lon: centro[0], lat: centro[1] },
  ],
};

describe('entorno con coordenadas congeladas', () => {
  it('una ribera abierta no se cierra formando un lago triangular sobre la ciudad', () => {
    const base = buildCampusMap([contorno], { center: centro, boundaryWayId: 1 });
    const ribera: OsmWay = {
      type: 'way',
      id: 2,
      tags: { natural: 'water' },
      geometry: [
        { lon: centro[0] - 0.01, lat: centro[1] },
        { lon: centro[0] - 0.011, lat: centro[1] - 0.003 },
        { lon: centro[0] - 0.01, lat: centro[1] - 0.005 },
      ],
    };
    const resultado = construirEntorno([ribera], contorno, centro, base.area);
    expect(resultado.formas[0]?.lineal).toBe(true);
    expect(resultado.formas[0]?.d.endsWith('Z')).toBe(false);
  });
  it('amplía el dibujo sin cambiar el área ni el origen de la base', () => {
    const base = buildCampusMap([contorno], { center: centro, boundaryWayId: 1 });
    const copia = structuredClone(base.area);
    const resultado = construirEntorno([contorno], contorno, centro, base.area);
    expect(base.area).toEqual(copia);
    expect(resultado.limites[0]).toEqual([-1830, -1830]);
    expect(resultado.limites[1]![0]).toBeCloseTo(base.area.width + 1830);
  });
  it('rechaza un origen que desplazaría los pines guardados', () => {
    const base = buildCampusMap([contorno], { center: centro, boundaryWayId: 1 });
    base.area.boundary[0]![0] += 1;
    expect(() => construirEntorno([], contorno, centro, base.area)).toThrow('coordenadas');
  });
  it('el entorno publicado rodea el campus y contiene referencias de Concepción', () => {
    expect(entorno.formas.length).toBeGreaterThan(campus.features.length);
    expect(entorno.limites[0]).toEqual([-1830, -1830]);
    expect(entorno.limites[1]![0]).toBeCloseTo(area.width + 1830);
    expect(entorno.rotulos.some((r) => r.name.includes('Chacabuco'))).toBe(true);
    expect(
      entorno.rotulos.some((r) => r.name.includes('O’Higgins') || r.name.includes("O'Higgins")),
    ).toBe(true);
  });
});
