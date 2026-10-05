import { buildCampusMap, project, type CampusArea, type MapFeature, type OsmWay } from './osm';

export interface Entorno {
  generado: string;
  atribucion: string;
  desplazamiento: [number, number];
  limites: [[number, number], [number, number]];
  formas: (MapFeature & { lineal?: boolean })[];
  rotulos: { id: string; name: string; cx: number; cy: number; area: number }[];
}

/** Usa el origen congelado del campus: ampliar la ciudad nunca vuelve a ubicar sus pines. */
export function construirEntorno(
  elementos: OsmWay[],
  contorno: OsmWay,
  centro: [number, number],
  area: CampusArea,
): Entorno {
  const base = buildCampusMap([contorno], {
    center: centro,
    boundaryWayId: contorno.id,
    margin: 70,
  });
  if (JSON.stringify(base.area) !== JSON.stringify(area)) {
    throw new Error('El contorno original no corresponde al sistema de coordenadas publicado.');
  }
  const ampliado = buildCampusMap([...elementos.filter((e) => e.id !== contorno.id), contorno], {
    center: centro,
    boundaryWayId: contorno.id,
    margin: 1900,
  });
  const dx = ampliado.area.boundary[0]![0] - area.boundary[0]![0];
  const dy = ampliado.area.boundary[0]![1] - area.boundary[0]![1];
  const punto = contorno.geometry![0]!;
  const referencia = project(centro, punto.lon, punto.lat);
  const origen: [number, number] = [
    area.boundary[0]![0] - referencia[0],
    area.boundary[0]![1] - referencia[1],
  ];
  const rotulos: Entorno['rotulos'] = [];
  const usados = new Set<string>();
  for (const via of elementos) {
    const nombre = via.tags?.name;
    const calle = ['primary', 'secondary', 'tertiary', 'residential'].includes(
      via.tags?.highway ?? '',
    );
    const lugar =
      ['park', 'garden'].includes(via.tags?.leisure ?? '') ||
      via.tags?.amenity === 'hospital' ||
      via.tags?.natural === 'water';
    if (!nombre || (!calle && !lugar) || !via.geometry?.length || usados.has(nombre)) continue;
    const puntos = via.geometry.map((g) => project(centro, g.lon, g.lat, origen));
    const [cx, cy] = puntos[Math.floor(puntos.length / 2)]!;
    if (cx >= 0 && cy >= 0 && cx <= area.width && cy <= area.height) continue;
    if (cx < -dx || cy < -dy || cx > ampliado.map.world[0] - dx || cy > ampliado.map.world[1] - dy)
      continue;
    usados.add(nombre);
    rotulos.push({
      id: `entorno-${via.id}`,
      name: nombre,
      cx,
      cy,
      area: lugar ? 20000 : calle ? 5000 : 1000,
    });
  }
  return {
    generado: ampliado.map.generated,
    atribucion: ampliado.map.attribution,
    desplazamiento: [-dx, -dy],
    limites: [
      [-dx, -dy],
      [ampliado.map.world[0] - dx, ampliado.map.world[1] - dy],
    ],
    formas: ampliado.map.features.map(({ k, d }) => {
      // Una ribera abierta no es un lago: cerrarla dibujaría un triángulo sobre la ciudad.
      const puntos = d.match(/-?\d+(?:\.\d+)?/g)!;
      const lineal = k === 'agua' && (puntos[0] !== puntos.at(-2) || puntos[1] !== puntos.at(-1));
      return lineal ? { k, d: d.replace(/Z$/, ''), lineal: true } : { k, d };
    }),
    rotulos,
  };
}
