import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generarCarreras } from './build';

const catalogo = JSON.parse(readFileSync(new URL('./catalogo.json', import.meta.url), 'utf8'));
describe('catálogo oficial de carreras', () => {
  it('conserva las ofertas de los tres campus y produce identificadores distintos', () => {
    const semilla = generarCarreras(catalogo);
    expect(semilla.temas).toHaveLength(92);
    expect(new Set(semilla.temas.map((t) => t.id)).size).toBe(92);
    expect(
      ['Concepción', 'Chillán', 'Los Ángeles'].map(
        (campus) => semilla.temas.filter((t) => t.campus === campus).length,
      ),
    ).toEqual([74, 7, 11]);
    expect(
      semilla.temas
        .filter((t) => t.nombre === 'Ingeniería Ambiental')
        .map((t) => t.grupo)
        .sort(),
    ).toEqual(['Facultad de Ciencias Ambientales', 'Facultad de Ingeniería Agrícola']);
  });
  it('la semilla publicada es reproducible desde la fuente versionada', () => {
    const publicada = JSON.parse(
      readFileSync(new URL('../../server/data/carreras.json', import.meta.url), 'utf8'),
    );
    expect(publicada).toEqual(generarCarreras(catalogo));
  });
  it('rechaza duplicados y campus ajenos al catálogo', () => {
    expect(() =>
      generarCarreras({ ...catalogo, unidades: [...catalogo.unidades, catalogo.unidades[0]] }),
    ).toThrow(/repetidas/);
    expect(() =>
      generarCarreras({
        ...catalogo,
        unidades: [{ ...catalogo.unidades[0], campus: 'Inventado' }],
      }),
    ).toThrow();
  });
});
