/**
 * Construcción del mapa del campus a partir de datos de OpenStreetMap.
 *
 * El lienzo no es un cuadrado arbitrario: se calcula a partir del **contorno oficial del
 * campus** (la vía `amenity=university` de la UdeC en OpenStreetMap), más un margen. Ese mismo
 * contorno es el que limita dónde se pueden poner pines.
 *
 * Los datos son de OpenStreetMap y sus colaboradores (licencia ODbL): la aplicación debe
 * mostrar la atribución. El plano oficial de la universidad se usa después para corregir.
 */

export interface OsmWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** Tipos de forma que dibuja el mapa, en orden de pintado (el primero va al fondo). */
export const KINDS = ['agua', 'verde', 'calle', 'sendero', 'edificio'] as const;
export type Kind = (typeof KINDS)[number];

export type Point = [number, number];

export interface MapFeature {
  /** Tipo de forma (define el color desde el CSS de la aplicación). */
  k: Kind;
  /** Path SVG en metros dentro del lienzo. */
  d: string;
  /** Solo edificios con nombre. */
  id?: string;
  n?: string;
}

export interface Building {
  id: string;
  name: string;
  /** Centro de la silueta, para poner la ficha y el rótulo. */
  cx: number;
  cy: number;
  /** Superficie aproximada en m², para ordenar y decidir qué rotular. */
  area: number;
}

export interface CampusMap {
  generated: string;
  center: [number, number];
  /** Ancho y alto del lienzo en metros. */
  world: [number, number];
  viewBox: [number, number, number, number];
  attribution: string;
  features: MapFeature[];
  buildings: Building[];
  /** Superficie mínima (m²) a partir de la cual conviene rotular un edificio. */
  minLabelArea: number;
}

/** Lo que necesitan cliente y servidor para saber qué es "dentro de la universidad". */
export interface CampusArea {
  width: number;
  height: number;
  /** Contorno del campus en coordenadas del lienzo (metros). */
  boundary: Point[];
}

export const ATTRIBUTION = '© colaboradores de OpenStreetMap';

const METERS_PER_DEGREE = 111_320;

/** Proyección local plana: suficiente y exacta a escala de un campus. Metros, con Y hacia abajo. */
export function project(
  center: [number, number],
  lon: number,
  lat: number,
  offset: Point = [0, 0],
): Point {
  const [lon0, lat0] = center;
  const k = Math.cos((lat0 * Math.PI) / 180);
  // El "+ 0" evita el cero negativo, que ensucia comparaciones y datos.
  return [
    (lon - lon0) * METERS_PER_DEGREE * k + offset[0] + 0,
    -(lat - lat0) * METERS_PER_DEGREE + offset[1] + 0,
  ];
}

export function classify(tags: Record<string, string> = {}): Kind | null {
  if (tags.building) return 'edificio';
  if (tags.natural === 'water' || tags.waterway) return 'agua';
  if (
    tags.leisure === 'park' ||
    tags.leisure === 'garden' ||
    tags.leisure === 'pitch' ||
    tags.landuse === 'grass' ||
    tags.landuse === 'forest' ||
    tags.natural === 'wood' ||
    tags.natural === 'scrub'
  ) {
    return 'verde';
  }
  if (!tags.highway) return null;
  return ['footway', 'path', 'pedestrian', 'steps', 'cycleway'].includes(tags.highway)
    ? 'sendero'
    : 'calle';
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sin-nombre'
  );
}

const CLOSED: Kind[] = ['edificio', 'verde', 'agua'];

/** Área del polígono (fórmula del cordón de zapato), en m². */
function polygonArea(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function centroid(points: Point[]): Point {
  const n = points.length || 1;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}

/** Redondea a 0,1 m: más que suficiente y ahorra bytes. */
const round = (v: number) => Math.round(v * 10) / 10 + 0;

function toPath(points: Point[], closed: boolean): string {
  let d = '';
  let prev: Point | null = null;
  for (const [x, y] of points) {
    const rx = round(x);
    const ry = round(y);
    // Se saltan puntos que caen en el mismo decímetro: no aportan nada al dibujo.
    if (prev && prev[0] === rx && prev[1] === ry) continue;
    d += `${prev ? 'L' : 'M'}${rx} ${ry}`;
    prev = [rx, ry];
  }
  return closed ? `${d}Z` : d;
}

export interface BuildOptions {
  center: [number, number];
  /** Id de la vía del contorno del campus en OpenStreetMap. */
  boundaryWayId: number;
  /** Metros de margen alrededor del contorno (se puede mirar un poco más allá). */
  margin?: number;
  /** Superficie mínima (m²) para rotular un edificio en el mapa. */
  minLabelArea?: number;
  today?: string;
}

function boundaryPoints(elements: OsmWay[], opts: BuildOptions): { lon: number; lat: number }[] {
  const way = elements.find((e) => e.id === opts.boundaryWayId && e.geometry);
  if (!way?.geometry) {
    throw new Error(
      `No se encontró el contorno del campus (vía ${opts.boundaryWayId}) en los datos descargados.`,
    );
  }
  return way.geometry;
}

/** Convierte elementos de OpenStreetMap en los datos del mapa y en el área del campus. */
export function buildCampusMap(
  elements: OsmWay[],
  opts: BuildOptions,
): { map: CampusMap; area: CampusArea } {
  const { center } = opts;
  const margin = opts.margin ?? 70;
  const minLabelArea = opts.minLabelArea ?? 150;

  // 1. El contorno define el lienzo: su caja más el margen, llevada a coordenadas positivas.
  const raw = boundaryPoints(elements, opts).map((g) => project(center, g.lon, g.lat));
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const offset: Point = [-(Math.min(...xs) - margin), -(Math.min(...ys) - margin)];
  const width = round(Math.max(...xs) - Math.min(...xs) + margin * 2);
  const height = round(Math.max(...ys) - Math.min(...ys) + margin * 2);
  const boundary: Point[] = raw.map(([x, y]) => [round(x + offset[0]), round(y + offset[1])]);

  // 2. Formas del mapa, recortadas al lienzo.
  const features: MapFeature[] = [];
  const buildings: Building[] = [];
  const usedIds = new Map<string, number>();
  const seenWays = new Set<number>();

  const byKind = new Map<Kind, OsmWay[]>();
  for (const w of elements) {
    if (w.type !== 'way' || !w.geometry || w.geometry.length < 2) continue;
    if (seenWays.has(w.id)) continue;
    seenWays.add(w.id);
    const kind = classify(w.tags);
    if (!kind) continue;
    const list = byKind.get(kind) ?? [];
    list.push(w);
    byKind.set(kind, list);
  }

  for (const kind of KINDS) {
    for (const w of byKind.get(kind) ?? []) {
      const points = w.geometry!.map((g) => project(center, g.lon, g.lat, offset));
      if (!points.some(([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height)) continue;

      const feature: MapFeature = { k: kind, d: toPath(points, CLOSED.includes(kind)) };
      const name = w.tags?.name;
      const [cx, cy] = centroid(points);
      // Un edificio cortado por el borde tiene su centro fuera del lienzo: se dibuja, pero no
      // se puede rotular ni abrir su ficha, así que no entra al listado.
      const dentro = cx >= 0 && cx <= width && cy >= 0 && cy <= height;

      if (kind === 'edificio' && name && dentro) {
        // Ids estables y únicos: si dos edificios comparten nombre, se numeran.
        // Se quita el "Edificio" inicial del nombre para no repetirlo en el id.
        const base = `edificio-${slug(name.replace(/^edificio\s+/i, ''))}`;
        const seen = usedIds.get(base) ?? 0;
        usedIds.set(base, seen + 1);
        const id = seen === 0 ? base : `${base}-${seen + 1}`;
        feature.id = id;
        feature.n = name;
        buildings.push({
          id,
          name,
          cx: round(cx),
          cy: round(cy),
          area: Math.round(polygonArea(points)),
        });
      }
      features.push(feature);
    }
  }

  buildings.sort((a, b) => b.area - a.area);
  return {
    map: {
      generated: opts.today ?? new Date().toISOString().slice(0, 10),
      center,
      world: [width, height],
      viewBox: [0, 0, width, height],
      attribution: ATTRIBUTION,
      features,
      buildings,
      minLabelArea,
    },
    area: { width, height, boundary },
  };
}

/** SVG independiente para revisar el resultado fuera de la aplicación. */
export function toPreviewSvg(map: CampusMap, area: CampusArea): string {
  const [x, y, w, h] = map.viewBox;
  const paths = map.features
    .map((f) => `<path class="${f.k}"${f.id ? ` id="${f.id}"` : ''} d="${f.d}"/>`)
    .join('\n');
  const labels = map.buildings
    .filter((b) => b.area >= map.minLabelArea)
    .map(
      (b) => `<text class="rotulo" x="${b.cx}" y="${b.cy}">${b.name.replace(/[<&]/g, '')}</text>`,
    )
    .join('\n');
  const limite = `<path class="limite" d="${toPath(area.boundary, true)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">
<style>
  .edificio{fill:#e4e7ee;stroke:#c2c8d4;stroke-width:.5}
  .verde{fill:#e8f2e6;stroke:none}
  .agua{fill:#dcebf6;stroke:none}
  .calle{fill:none;stroke:#dcdfe5;stroke-width:5;stroke-linecap:round}
  .sendero{fill:none;stroke:#e6e8ec;stroke-width:2;stroke-linecap:round;stroke-dasharray:4 3}
  .limite{fill:none;stroke:#3e63dd;stroke-width:2;stroke-dasharray:8 6}
  .rotulo{font:4px system-ui,sans-serif;fill:#3c4149;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:1.2}
</style>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>
${paths}
${limite}
${labels}
</svg>`;
}
