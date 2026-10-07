/**
 * Descarga las fotos de edificios que están en Wikimedia Commons con licencia libre y
 * completa `client/src/map/edificios.json` con su crédito.
 *
 *   npx tsx scripts/fotos/build.ts [--ancho 1200] [--forzar]
 *
 * La lista curada vive en `scripts/fotos/fuentes.json`. Las descripciones escritas a mano
 * no se tocan: solo se reemplaza el arreglo `fotos` de los edificios listados ahí.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descargar, fichas } from './commons';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DESTINO_FOTOS = join(raiz, 'client/public/edificios');
const FICHAS = join(raiz, 'client/src/map/edificios.json');
const CAMPUS = join(raiz, 'client/src/map/campus.json');
const FUENTES = join(raiz, 'scripts/fotos/fuentes.json');

interface Fuente {
  id: string;
  titulos: string[];
}

interface Foto {
  archivo: string;
  autor?: string;
  licencia?: string;
  fuente?: string;
}

interface Ficha {
  descripcion: string;
  fuenteDescripcion?: string;
  fotos: Foto[];
}

function argumento(nombre: string, porDefecto: number): number {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return porDefecto;
  const valor = Number(process.argv[i + 1]);
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
}

async function main(): Promise<void> {
  const ancho = argumento('ancho', 1200);
  const forzar = process.argv.includes('--forzar');

  const fuentes = JSON.parse(await readFile(FUENTES, 'utf8')) as { edificios: Fuente[] };
  const campus = JSON.parse(await readFile(CAMPUS, 'utf8')) as { buildings: { id: string }[] };
  const conocidos = new Set(campus.buildings.map((b) => b.id));

  for (const fuente of fuentes.edificios) {
    if (!conocidos.has(fuente.id)) {
      throw new Error(`"${fuente.id}" no existe en campus.json (¿cambió el mapa?)`);
    }
  }

  const meta = await fichas(fuentes.edificios.flatMap((e) => e.titulos));
  await mkdir(DESTINO_FOTOS, { recursive: true });

  const previas = existsSync(FICHAS)
    ? (JSON.parse(await readFile(FICHAS, 'utf8')) as Record<string, Ficha>)
    : {};
  const salida: Record<string, Ficha> = { ...previas };
  let descargadas = 0;

  for (const fuente of fuentes.edificios) {
    const corto = fuente.id.replace(/^edificio-/, '');
    const fotos: Foto[] = [];

    for (const [i, titulo] of fuente.titulos.entries()) {
      const ficha = meta.get(titulo);
      if (!ficha) throw new Error(`Commons no conoce "${titulo}"`);

      const archivo = i === 0 ? `${corto}.jpg` : `${corto}-${i + 1}.jpg`;
      const ruta = join(DESTINO_FOTOS, archivo);
      if (forzar || !existsSync(ruta)) {
        await writeFile(ruta, await descargar(titulo, ancho));
        descargadas++;
        console.log(`  ${archivo}  ←  ${titulo}`);
      }
      fotos.push({
        archivo,
        autor: ficha.autor,
        licencia: ficha.licencia,
        fuente: ficha.pagina,
      });
    }

    salida[fuente.id] = {
      ...previas[fuente.id],
      descripcion: previas[fuente.id]?.descripcion ?? '',
      fotos,
    };
  }

  const ordenado = Object.fromEntries(
    Object.entries(salida).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(FICHAS, `${JSON.stringify(ordenado, null, 2)}\n`, 'utf8');

  const conFoto = Object.values(ordenado).filter((f) => f.fotos.length > 0).length;
  console.log(
    `\nFotos descargadas ahora: ${descargadas}. Edificios con foto: ${conFoto} de ${campus.buildings.length}.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
