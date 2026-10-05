/** Genera una capa ODbL del entorno sin modificar campus.json ni campus-area.json. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { construirEntorno } from './entorno';
import type { CampusArea, CampusMap, OsmWay } from './osm';

const leer = async <T>(ruta: string): Promise<T> => JSON.parse(await readFile(ruta, 'utf8')) as T;
const campus = await leer<CampusMap>('client/src/map/campus.json');
const area = await leer<CampusArea>('shared/src/campus-area.json');
const original = await leer<{ elements: OsmWay[] }>('assets/mapa/osm-campus.json');
const contorno = original.elements.find((e) => e.id === 113312181 && e.type === 'way');
if (!contorno) throw new Error('Falta la copia original del contorno del campus.');
const ruta = 'assets/mapa/osm-entorno.json';
if (process.argv.includes('--fetch')) {
  const consulta = `[out:json][timeout:90];(way(around:3000,-36.829,-73.0364)[building];way(around:3000,-36.829,-73.0364)[highway];way(around:3000,-36.829,-73.0364)[leisure];way(around:3000,-36.829,-73.0364)[landuse];way(around:3000,-36.829,-73.0364)[natural];way(around:3000,-36.829,-73.0364)[waterway];way(around:3000,-36.829,-73.0364)[amenity=hospital];);out geom;`;
  const respuesta = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'user-agent': 'PizarraUdeC/0.1 (entorno de Concepcion; equipo universitario)' },
    body: new URLSearchParams({ data: consulta }),
    signal: AbortSignal.timeout(115000),
  });
  if (!respuesta.ok) throw new Error(`OpenStreetMap respondió ${respuesta.status}.`);
  const texto = await respuesta.text();
  JSON.parse(texto);
  await mkdir('assets/mapa', { recursive: true });
  await writeFile(ruta, texto);
}
const datos = await leer<{ elements: OsmWay[] }>(ruta);
const entorno = construirEntorno(datos.elements, contorno, campus.center, area);
await writeFile('client/src/map/entorno.json', JSON.stringify(entorno));
console.log(
  `${entorno.formas.length} formas y ${entorno.rotulos.length} referencias de Concepción, conservando el origen del campus.`,
);
