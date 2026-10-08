import { describe, expect, it } from 'vitest';
import { cargaCompleta } from './resultado';

describe('resultado de la prueba de carga', () => {
  it('falla cuando todos los pines se rechazan y no hay entregas', () => {
    expect(cargaCompleta(600, 40, 40, 0)).toBe(false);
  });
  it('falla si se rechaza una publicación aunque las demás lleguen', () => {
    expect(cargaCompleta(600, 40, 1, 23400)).toBe(false);
  });
  it('falla cuando se pierde una entrega', () => {
    expect(cargaCompleta(600, 40, 0, 23999)).toBe(false);
  });
  it('acepta la difusión de los 40 pines a los 600 lectores', () => {
    expect(cargaCompleta(600, 40, 0, 24000)).toBe(true);
  });
});
