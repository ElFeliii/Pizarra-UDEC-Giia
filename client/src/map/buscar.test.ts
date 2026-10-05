import { describe, expect, it } from 'vitest';
import { buscarEdificios } from './buscar';

const nombres = (q: string) => buscarEdificios(q).map((b) => b.name);

describe('buscar edificios del campus', () => {
  it('encuentra por nombre, sin importar tildes ni mayúsculas', () => {
    expect(nombres('CAMPANIL')).toContain('Campanil');
    expect(nombres('biblioteca')).toContain('Biblioteca Central Luis David Cruz Ocampo');
    expect(nombres('odontologia')).toContain('Facultad de Odontología');
  });

  it('tolera la terminación de la palabra', () => {
    // "biologia" y "Biológicas" comparten la raíz.
    expect(nombres('biologia')).toContain('Facultad de Ciencias Biológicas (Arco)');
    expect(nombres('quimica')).toContain('Facultad de Ciencias Químicas');
  });

  it('encuentra por una palabra del medio', () => {
    expect(nombres('salvador')).toContain('Edificio de Aulas Salvador Gálvez');
    expect(nombres('arte')).toContain('Casa del Arte José Clemente Orozco');
  });

  it('no devuelve nada con menos de dos letras ni con algo que no existe', () => {
    expect(buscarEdificios('a')).toEqual([]);
    expect(buscarEdificios('')).toEqual([]);
    expect(buscarEdificios('supermercado')).toEqual([]);
  });

  it('devuelve como máximo el límite pedido', () => {
    expect(buscarEdificios('facultad', 3)).toHaveLength(3);
    expect(buscarEdificios('facultad').length).toBeLessThanOrEqual(6);
  });

  it('a igual coincidencia, primero el edificio más grande', () => {
    const r = buscarEdificios('facultad');
    const areas = r.map((b) => b.area);
    expect(areas).toEqual([...areas].sort((a, b) => b - a));
  });
});
