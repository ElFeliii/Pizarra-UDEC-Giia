/**
 * Escribe `docs/EDIFICIOS.md`: la lista de los edificios del mapa con el estado de su ficha,
 * para que el equipo sepa qué falta fotografiar y describir.
 *
 *   npx tsx scripts/fotos/inventario.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

interface Foto {
  archivo: string;
  autor?: string;
  licencia?: string;
  fuente?: string;
}

const leer = async <T>(ruta: string): Promise<T> =>
  JSON.parse(await readFile(join(raiz, ruta), 'utf8')) as T;

const campus = await leer<{ buildings: { id: string; name: string; area: number }[] }>(
  'client/src/map/campus.json',
);
const fichas = await leer<Record<string, { descripcion: string; fotos: Foto[] }>>(
  'client/src/map/edificios.json',
);

const edificios = [...campus.buildings].sort((a, b) => b.area - a.area);
const conFoto = edificios.filter((e) => (fichas[e.id]?.fotos.length ?? 0) > 0);
const conTexto = edificios.filter((e) => (fichas[e.id]?.descripcion ?? '') !== '');

const fila = (e: { id: string; name: string; area: number }): string => {
  const ficha = fichas[e.id];
  const fotos = ficha?.fotos ?? [];
  const credito = fotos
    .map((f) => (f.autor ? `${f.autor}${f.licencia ? ` (${f.licencia})` : ''}` : 'propia'))
    .join('; ');
  return `| ${e.name} | ${Math.round(e.area)} | ${fotos.length > 0 ? `✅ ${fotos.length}` : '—'} | ${
    ficha?.descripcion ? '✅' : '—'
  } | ${credito || ''} | \`${e.id}\` |`;
};

const doc = `# Edificios del mapa

> Generado por \`npm run fotos:inventario\`. No lo edites a mano.

${edificios.length} edificios con nombre, tomados de OpenStreetMap. **Con foto: ${conFoto.length}.
Con descripción: ${conTexto.length}.**

Todos los edificios identificados se pueden abrir desde su silueta, su nombre o el buscador,
incluso si falta contenido. Las fotos y descripciones disponibles viven en
\`client/src/map/edificios.json\`; los campos pendientes se indican en la ficha.

## Cómo agregar una foto propia

1. Deja el archivo en \`client/public/edificios/\` (JPG, ~900 px de ancho, menos de 300 KB).
2. Anótalo en \`client/src/map/edificios.json\`:

\`\`\`json
"edificio-gimnasio-c": {
  "descripcion": "Texto que se muestra en la ventana del edificio.",
  "fotos": [{ "archivo": "gimnasio-c.jpg" }]
}
\`\`\`

Una foto tomada por el equipo no lleva \`autor\`, \`licencia\` ni \`fuente\`: son para material de
terceros. Si la foto es de otra persona (incluida la Dirección de Comunicaciones de la UdeC),
pide autorización por escrito y anota el crédito en esos tres campos.

**No sirven las fotos de Google Maps, Street View, Instagram ni sitios de noticias**: tienen
derechos de autor y publicarlas en el sitio de la Universidad la expone a un reclamo. Las que
ya están vinieron de Wikimedia Commons, con licencia libre y su crédito visible en la ficha.

3. Corre \`npm test\` (hay pruebas que verifican que cada foto anotada exista) y
   \`npm run fotos:inventario\` para actualizar esta lista.

## Lista

| Edificio | Área (m²) | Foto | Descripción | Crédito | id |
| --- | ---: | --- | --- | --- | --- |
${edificios.map(fila).join('\n')}
`;

await writeFile(join(raiz, 'docs/EDIFICIOS.md'), doc, 'utf8');
console.log(
  `docs/EDIFICIOS.md: ${edificios.length} edificios, ${conFoto.length} con foto, ${conTexto.length} con descripción.`,
);
