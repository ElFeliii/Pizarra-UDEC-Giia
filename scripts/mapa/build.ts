/**
 * Descarga los datos del campus desde OpenStreetMap y genera el mapa que usa la aplicación.
 *
 *   npx tsx scripts/mapa/build.ts --fetch     # descarga y genera
 *   npx tsx scripts/mapa/build.ts             # regenera desde la copia local
 *   npx tsx scripts/mapa/build.ts --radius 380
 *
 * Genera:
 *   client/src/map/campus.json     datos del mapa (los usa la vista del mapa)
 *   assets/mapa/campus-preview.svg vista para revisar el resultado
 *   assets/mapa/osm-campus.json    copia cruda de OpenStreetMap (no se sube al repositorio)
 */
import { mkdirSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildCampusMap, toPreviewSvg, type OsmWay } from './osm';

/** Centro del campus de la Universidad de Concepción (plaza del Campanil). */
const CENTER: [number, number] = [-73.0364, -36.829];
/** Vía de OpenStreetMap con el contorno oficial del campus (amenity=university, UdeC). */
const BOUNDARY_WAY = 113312181;
const RAW = 'assets/mapa/osm-campus.json';
const DATA = 'client/src/map/campus.json';
const AREA = 'shared/src/campus-area.json';
const PREVIEW = 'assets/mapa/campus-preview.svg';
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'PizarraUdeC/0.1 (mapa del campus; proyecto universitario)';

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
};

function query(radius: number): string {
  const [lon, lat] = CENTER;
  const around = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:90];(
    way(${BOUNDARY_WAY});
    way${around}["building"];
    way${around}["highway"];
    way${around}["leisure"];
    way${around}["landuse"];
    way${around}["natural"];
    way${around}["waterway"];
  );out geom;`;
}

async function fetchOsm(radius: number): Promise<OsmWay[]> {
  // Overpass se satura a ratos: se reintenta con espera creciente.
  for (let intento = 1; intento <= 4; intento++) {
    process.stdout.write(`Descargando de OpenStreetMap (intento ${intento})… `);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
        body: new URLSearchParams({ data: query(radius) }),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) {
        console.log(`respuesta no válida (${res.status})`);
      } else {
        const json = JSON.parse(text) as { elements: OsmWay[] };
        console.log(`${json.elements.length} elementos`);
        mkdirSync(dirname(RAW), { recursive: true });
        writeFileSync(RAW, JSON.stringify(json));
        return json.elements;
      }
    } catch (e) {
      console.log(e instanceof Error ? e.message : 'error');
    }
    await new Promise((r) => setTimeout(r, intento * 5000));
  }
  throw new Error('No se pudo descargar de OpenStreetMap. Inténtalo de nuevo en unos minutos.');
}

async function main() {
  // Radio de descarga: el campus mide ~1,3 km de largo, así que 1200 m cubre todo con holgura.
  const radius = Number(arg('radius', '1200'));
  const margin = Number(arg('margin', '70'));
  const wantFetch = process.argv.includes('--fetch');

  let elements: OsmWay[];
  if (wantFetch || !existsSync(RAW)) {
    elements = await fetchOsm(radius);
  } else {
    elements = (JSON.parse(readFileSync(RAW, 'utf8')) as { elements: OsmWay[] }).elements;
    const dias = (Date.now() - statSync(RAW).mtimeMs) / 86_400_000;
    console.log(
      `Usando la copia local de ${RAW} (${elements.length} elementos, ${dias.toFixed(0)} días). --fetch la actualiza.`,
    );
  }

  const { map, area } = buildCampusMap(elements, {
    center: CENTER,
    boundaryWayId: BOUNDARY_WAY,
    margin,
  });
  mkdirSync(dirname(DATA), { recursive: true });
  writeFileSync(DATA, JSON.stringify(map));
  writeFileSync(AREA, JSON.stringify(area));
  writeFileSync(PREVIEW, toPreviewSvg(map, area));

  const kb = (p: string) => `${(statSync(p).size / 1024).toFixed(0)} KB`;
  console.log(`\n${map.features.length} formas · ${map.buildings.length} edificios con nombre`);
  console.log(
    `Lienzo: ${map.world[0]} x ${map.world[1]} m · contorno de ${area.boundary.length} puntos`,
  );
  console.log(`${DATA} (${kb(DATA)})`);
  console.log(`${AREA} (${kb(AREA)})`);
  console.log(`${PREVIEW} (${kb(PREVIEW)})`);
  console.log(`\nEdificios más grandes:`);
  for (const b of map.buildings.slice(0, 8)) {
    console.log(`  ${b.name.padEnd(48).slice(0, 48)} ${String(b.area).padStart(6)} m²  ${b.id}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
