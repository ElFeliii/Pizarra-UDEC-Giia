/** Regenera la semilla desde la transcripción documentada del catálogo oficial UdeC. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const catalogoSchema = z.object({
  version: z.number().int().positive(),
  fechaConsulta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fuentes: z.array(z.url()).min(1),
  unidades: z
    .array(
      z.object({
        nombre: z.string().trim().min(3),
        campus: z.enum(['Concepción', 'Chillán', 'Los Ángeles']),
        carreras: z.array(z.string().trim().min(3)).min(1),
      }),
    )
    .min(1),
});

function identificador(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function generarCarreras(entrada: unknown) {
  const catalogo = catalogoSchema.parse(entrada);
  const carreras = catalogo.unidades
    .flatMap((unidad) =>
      unidad.carreras.map((nombre) => ({
        id: `carrera-${identificador(nombre)}-${identificador(unidad.campus)}`,
        nombre,
        grupo: unidad.nombre,
        campus: unidad.campus,
      })),
    )
    .sort(
      (a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.campus.localeCompare(b.campus, 'es'),
    );
  if (new Set(carreras.map((carrera) => carrera.id)).size !== carreras.length) {
    throw new Error('El catálogo contiene carreras repetidas en un mismo campus.');
  }
  return {
    version: catalogo.version,
    fechaConsulta: catalogo.fechaConsulta,
    fuentes: catalogo.fuentes,
    temas: carreras.map((carrera, orden) => ({ ...carrera, orden })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ruta = process.argv[2]
    ? resolve(process.argv[2])
    : new URL('./catalogo.json', import.meta.url);
  const semilla = generarCarreras(JSON.parse(readFileSync(ruta, 'utf8')));
  const salida = new URL('../../server/data/carreras.json', import.meta.url);
  writeFileSync(salida, `${JSON.stringify(semilla, null, 2)}\n`);
  console.log(`${semilla.temas.length} carreras por campus → server/data/carreras.json`);
}
