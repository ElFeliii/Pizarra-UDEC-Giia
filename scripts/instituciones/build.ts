/**
 * Arma la lista de instituciones (colegios y universidades) que ve el asistente al entrar.
 *
 *   npx tsx scripts/instituciones/build.ts "<Directorio_Oficial_EE_2025.csv>"
 *
 * Fuente de los colegios: **Directorio Oficial de Establecimientos Educacionales** del MINEDUC
 * (datos abiertos). Se filtra por provincia y se dejan solo los establecimientos en
 * funcionamiento que imparten algo más que educación parvularia.
 *
 * Las universidades se mantienen a mano en `universidades.json` (son pocas y cambian poco).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import universidades from './universidades.json';

const SALIDA = 'server/data/instituciones.json';
/** Provincia de Concepción: Concepción, Talcahuano, Hualpén, San Pedro, Coronel, Penco… */
const PROVINCIA = process.env.PROVINCIA ?? '81';
const REGION = process.env.REGION ?? '8';

/** Palabras que se dejan en minúscula al pasar los nombres de MAYÚSCULAS a Capitalización. */
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el', 'en', 'a', 'al']);
/** Siglas y romanos que se dejan tal cual. */
const MAYUSCULAS = new Set([
  'SS',
  'CC',
  'AA',
  'DD',
  'JJ',
  'II',
  'III',
  'IV',
  'VI',
  'VII',
  'VIII',
  'IX',
  'XI',
  'XII',
  'XIV',
  'XV',
  'XXI',
  'XXIII',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'N',
  'Nº',
  'CEIA',
  'CFT',
  'IP',
  'UDEC',
]);

function titulo(nombre: string): string {
  return nombre
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((palabra, i) => {
      const limpia = palabra.replace(/[().,]/g, '');
      if (MAYUSCULAS.has(limpia)) return palabra;
      const baja = palabra.toLowerCase();
      if (i > 0 && MINUSCULAS.has(baja)) return baja;
      return baja.replace(
        /(^|[\s("'-])(\p{L})/gu,
        (_m, pre: string, letra: string) => pre + letra.toUpperCase(),
      );
    })
    .join(' ');
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface Institucion {
  id: string;
  name: string;
  type: 'colegio' | 'universidad';
  comuna?: string;
}

function leerColegios(csv: string): Institucion[] {
  const lineas = readFileSync(csv, 'utf8').split(/\r?\n/);
  const cabecera = lineas[0]!.replace(/^\uFEFF/, '').split(';');
  const I = new Map(cabecera.map((h, i) => [h, i]));
  /** Valor de una columna por nombre (el CSV trae decenas de columnas). */
  const campo = (fila: string[], columna: string): string => fila[I.get(columna) ?? -1] ?? '';
  const usados = new Map<string, number>();
  const salida: Institucion[] = [];

  for (const linea of lineas.slice(1)) {
    if (!linea) continue;
    const r = linea.split(';');
    if (campo(r, 'COD_REG_RBD') !== REGION || campo(r, 'COD_PRO_RBD') !== PROVINCIA) continue;
    // 1 = en funcionamiento.
    if (campo(r, 'ESTADO_ESTAB') !== '1') continue;

    // Códigos de enseñanza: 10 es parvularia. Se piden establecimientos con básica/media.
    const niveles = Array.from({ length: 11 }, (_, i) =>
      campo(r, `ENS_${String(i + 1).padStart(2, '0')}`),
    );
    if (!niveles.some((c) => c && c !== '0' && Number(c) >= 100)) continue;

    const comuna = titulo(campo(r, 'NOM_COM_RBD'));
    const name = titulo(campo(r, 'NOM_RBD'));
    if (!name) continue;

    // Hay nombres repetidos en distintas comunas (y alguno repetido dentro de la misma).
    const base = `${slug(name)}-${slug(comuna)}`;
    const visto = usados.get(base) ?? 0;
    usados.set(base, visto + 1);
    salida.push({
      id: visto === 0 ? base : `${base}-${visto + 1}`,
      name,
      type: 'colegio',
      comuna,
    });
  }

  salida.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return salida;
}

const csv = process.argv[2];
if (!csv) {
  console.error('Uso: tsx scripts/instituciones/build.ts <Directorio_Oficial_EE.csv>');
  process.exit(1);
}

const colegios = leerColegios(resolve(csv));
const univs = (universidades as Institucion[]).map((u) => ({ ...u, type: 'universidad' as const }));
const todas = [...univs, ...colegios];

writeFileSync(SALIDA, `${JSON.stringify(todas, null, 2)}\n`);

const porComuna = new Map<string, number>();
for (const c of colegios) porComuna.set(c.comuna!, (porComuna.get(c.comuna!) ?? 0) + 1);
console.log(`${todas.length} instituciones → ${SALIDA}`);
console.log(`  ${univs.length} universidades · ${colegios.length} colegios`);
console.log(
  [...porComuna]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `  ${c}: ${n}`)
    .join('\n'),
);
