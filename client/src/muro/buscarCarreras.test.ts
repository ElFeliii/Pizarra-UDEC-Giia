import { describe, expect, it } from 'vitest';
import { buscarPorNombre } from '../map/buscar';
const carreras = [
  { nombre: 'Ingeniería Civil Informática', orden: 0 },
  { nombre: 'Biología Marina', orden: 1 },
  { nombre: 'Bioingeniería', orden: 2 },
];
const buscar = (consulta: string) =>
  buscarPorNombre(
    consulta,
    carreras,
    (carrera) => carrera.nombre,
    (a, b) => a.orden - b.orden,
  ).map((carrera) => carrera.nombre);
describe('búsqueda de carreras con el buscador del mapa', () => {
  it('ignora tildes y mayúsculas y tolera terminaciones', () => {
    expect(buscar('INFORMATICA')).toEqual(['Ingeniería Civil Informática']);
    expect(buscar('biologicas')).toEqual(['Biología Marina']);
    expect(buscar('bio')).toEqual(['Biología Marina', 'Bioingeniería']);
  });
  it('no muestra coincidencias ajenas ni consultas demasiado cortas', () => {
    expect(buscar('odontología')).toEqual([]);
    expect(buscar('i')).toEqual([]);
  });
});
