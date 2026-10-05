import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

interface Foto {
  archivo: string;
  autor?: string;
  licencia?: string;
  fuente?: string;
}

const leer = async <T>(ruta: string): Promise<T> =>
  JSON.parse(await readFile(join(raiz, ruta), 'utf8')) as T;

const fichas = await leer<Record<string, { descripcion: string; fotos: Foto[] }>>(
  'client/src/map/edificios.json',
);
const campus = await leer<{ buildings: { id: string }[] }>('client/src/map/campus.json');
const fuentes = await leer<{ edificios: { id: string; titulos: string[] }[] }>(
  'scripts/fotos/fuentes.json',
);

describe('fichas de edificios', () => {
  it('solo describe edificios que existen en el mapa', () => {
    const conocidos = new Set(campus.buildings.map((b) => b.id));
    for (const id of Object.keys(fichas)) expect(conocidos, id).toContain(id);
  });

  it('cada foto anotada está en client/public/edificios', () => {
    for (const [id, ficha] of Object.entries(fichas)) {
      for (const foto of ficha.fotos) {
        const ruta = join(raiz, 'client/public/edificios', foto.archivo);
        expect(() => statSync(ruta), `${id} → ${foto.archivo}`).not.toThrow();
        expect(statSync(ruta).size, `${id} → ${foto.archivo}`).toBeGreaterThan(1024);
      }
    }
  });

  it('las fotos de terceros llevan autor y licencia (lo exige Creative Commons)', () => {
    for (const [id, ficha] of Object.entries(fichas)) {
      for (const foto of ficha.fotos) {
        if (!foto.fuente) continue;
        expect(foto.autor, `${id} → ${foto.archivo}`).toBeTruthy();
        expect(foto.licencia, `${id} → ${foto.archivo}`).toBeTruthy();
      }
    }
  });

  it('no hay archivos de foto repetidos entre edificios', () => {
    const usados = Object.values(fichas).flatMap((f) => f.fotos.map((x) => x.archivo));
    expect(new Set(usados).size).toBe(usados.length);
  });

  it('todo lo curado en fuentes.json quedó publicado', () => {
    for (const fuente of fuentes.edificios) {
      const ficha = fichas[fuente.id];
      expect(ficha, fuente.id).toBeDefined();
      expect(ficha!.fotos.length, fuente.id).toBe(fuente.titulos.length);
    }
  });
});
