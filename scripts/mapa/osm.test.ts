import { describe, expect, it } from 'vitest';
import { buildCampusMap, classify, project, slug, toPreviewSvg, type OsmWay } from './osm';

const CENTER: [number, number] = [-73.0364, -36.829];

/** Rectángulo de `size` grados alrededor de un punto, en sentido horario y cerrado. */
function way(
  id: number,
  tags: Record<string, string>,
  lon: number,
  lat: number,
  size = 0.0005,
): OsmWay {
  return {
    type: 'way',
    id,
    tags,
    geometry: [
      { lon, lat },
      { lon: lon + size, lat },
      { lon: lon + size, lat: lat + size },
      { lon, lat: lat + size },
      { lon, lat },
    ],
  };
}

describe('project', () => {
  it('desplaza el origen con el offset (coordenadas positivas)', () => {
    expect(project(CENTER, CENTER[0], CENTER[1], [420, 500])).toEqual([420, 500]);
  });

  it('devuelve metros con el eje Y hacia abajo', () => {
    expect(project(CENTER, CENTER[0], CENTER[1])).toEqual([0, 0]);
    // Un grado de latitud son ~111 km; hacia el norte, Y negativo.
    const [, y] = project(CENTER, CENTER[0], CENTER[1] + 0.001);
    expect(y).toBeCloseTo(-111.32, 1);
    const [x] = project(CENTER, CENTER[0] + 0.001, CENTER[1]);
    expect(x).toBeCloseTo(111.32 * Math.cos((CENTER[1] * Math.PI) / 180), 1);
  });
});

describe('classify', () => {
  it.each([
    [{ building: 'yes' }, 'edificio'],
    [{ building: 'university', name: 'X' }, 'edificio'],
    [{ natural: 'water' }, 'agua'],
    [{ leisure: 'park' }, 'verde'],
    [{ landuse: 'grass' }, 'verde'],
    [{ highway: 'footway' }, 'sendero'],
    [{ highway: 'residential' }, 'calle'],
  ])('%o → %s', (tags, expected) => {
    expect(classify(tags)).toBe(expected);
  });

  it('descarta lo que no se dibuja', () => {
    expect(classify({ barrier: 'fence' })).toBeNull();
    expect(classify({})).toBeNull();
  });
});

describe('slug', () => {
  it('normaliza nombres', () => {
    expect(slug('Facultad de Ingeniería')).toBe('facultad-de-ingenieria');
    expect(slug('Edificio EULA 1')).toBe('edificio-eula-1');
    expect(slug('  ¿?  ')).toBe('sin-nombre');
  });
});

describe('buildCampusMap', () => {
  /** Contorno de prueba: un cuadrado de 0,004° (unos 356 x 445 m) alrededor del centro. */
  const CONTORNO = way(
    100,
    { amenity: 'university', name: 'Universidad de prueba' },
    CENTER[0] - 0.002,
    CENTER[1] - 0.002,
    0.004,
  );
  const MARGEN = 50;

  const elements: OsmWay[] = [
    CONTORNO,
    way(1, { building: 'university', name: 'Facultad de Ingeniería' }, CENTER[0], CENTER[1]),
    way(2, { building: 'yes' }, CENTER[0] + 0.001, CENTER[1]),
    way(3, { leisure: 'park' }, CENTER[0] - 0.001, CENTER[1]),
    way(4, { building: 'yes', name: 'Facultad de Ingeniería' }, CENTER[0] + 0.0015, CENTER[1]),
    // Lejos del campus: se descarta.
    way(5, { building: 'yes', name: 'Casa vecina' }, CENTER[0] + 0.05, CENTER[1]),
    { type: 'way', id: 6, tags: { building: 'yes' } },
  ];
  const { map, area } = buildCampusMap(elements, {
    center: CENTER,
    boundaryWayId: 100,
    margin: MARGEN,
    today: '2026-09-22',
  });

  it('dibuja el fondo antes que los edificios', () => {
    expect(map.features.map((f) => f.k)).toEqual(['verde', 'edificio', 'edificio', 'edificio']);
  });

  it('recorta lo que queda fuera del lienzo y salta geometrías vacías', () => {
    expect(map.features).toHaveLength(4);
    expect(map.buildings.some((b) => b.name === 'Casa vecina')).toBe(false);
  });

  it('el lienzo es la caja del contorno más el margen, y el contorno cabe dentro', () => {
    const [w, h] = map.world;
    expect(map.viewBox).toEqual([0, 0, w, h]);
    // 0,004° de lado: ~356 m en X (corregido por la latitud) y ~445 m en Y, más 2 x 50 de margen.
    expect(w).toBeGreaterThan(356 + 2 * MARGEN - 2);
    expect(w).toBeLessThan(356 + 2 * MARGEN + 2);
    expect(h).toBeGreaterThan(445 + 2 * MARGEN - 2);
    expect(h).toBeLessThan(445 + 2 * MARGEN + 2);
    expect(area.width).toBe(w);
    expect(area.height).toBe(h);
    for (const [x, y] of area.boundary) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(h);
    }
    // El contorno arranca a `margin` del borde.
    expect(Math.min(...area.boundary.map((p) => p[0]))).toBeCloseTo(MARGEN, 1);
    expect(Math.min(...area.boundary.map((p) => p[1]))).toBeCloseTo(MARGEN, 1);
  });

  it('avisa si el contorno no viene en los datos', () => {
    expect(() => buildCampusMap(elements, { center: CENTER, boundaryWayId: 999 })).toThrow(
      /contorno/i,
    );
  });

  it('da id único a cada edificio con nombre', () => {
    expect(map.buildings.map((b) => b.id).sort()).toEqual([
      'edificio-facultad-de-ingenieria',
      'edificio-facultad-de-ingenieria-2',
    ]);
  });

  it('no repite la palabra "edificio" en el id', () => {
    const uno = buildCampusMap(
      [CONTORNO, way(9, { building: 'yes', name: 'Edificio EULA 1' }, CENTER[0], CENTER[1])],
      { center: CENTER, boundaryWayId: 100, margin: MARGEN },
    );
    expect(uno.map.buildings[0]!.id).toBe('edificio-eula-1');
  });

  it('calcula superficie y centro en metros, dentro del lienzo', () => {
    const b = map.buildings[0]!;
    // 0,0005° de lado ≈ 44,6 m x 55,7 m ≈ 2.480 m²
    expect(b.area).toBeGreaterThan(2000);
    expect(b.area).toBeLessThan(3000);
    expect(b.cx).toBeGreaterThan(0);
    expect(b.cx).toBeLessThan(map.world[0]);
    expect(b.cy).toBeGreaterThan(0);
    expect(b.cy).toBeLessThan(map.world[1]);
  });

  it('entrega la fecha y la atribución', () => {
    expect(map.generated).toBe('2026-09-22');
    expect(map.attribution).toContain('OpenStreetMap');
  });

  it('genera una vista previa SVG con los ids y el contorno', () => {
    const svg = toPreviewSvg(map, area);
    expect(svg).toContain(`viewBox="0 0 ${map.world[0]} ${map.world[1]}"`);
    expect(svg).toContain('id="edificio-facultad-de-ingenieria"');
    expect(svg).toContain('class="limite"');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
