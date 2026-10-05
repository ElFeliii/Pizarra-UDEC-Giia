import { describe, expect, it } from 'vitest';
import type { Building } from './campus';
import { campus } from './campus';
import { lineasDelRotulo, seleccionarRotulos } from './rotulos';
const edificio = (id: string, x: number, area = 5000): Building => ({
  id,
  name: id,
  cx: x,
  cy: 100,
  area,
});
describe('rótulos del mapa sin superposición', () => {
  it('oculta los rótulos al alejarse demasiado', () => {
    expect(seleccionarRotulos(campus.buildings, 0.2, true)).toEqual([]);
  });
  it('conserva referencias pequeñas aunque no alcancen el umbral por área', () => {
    expect(seleccionarRotulos([edificio('campanil', 0, 30)], 0.5, true)).toHaveLength(1);
  });
  it('prioriza el edificio elegido sobre vecinos que lo taparían', () => {
    const edificios = [edificio('grande', 0, 10000), edificio('elegido', 5, 30)];
    expect(seleccionarRotulos(edificios, 0.6, true, 'elegido').map((r) => r.edificio.id)).toEqual([
      'elegido',
    ]);
  });
  it('acercarse recupera nombres que antes no cabían', () => {
    const edificios = [edificio('uno', 0), edificio('dos', 55)];
    expect(seleccionarRotulos(edificios, 0.5, true)).toHaveLength(1);
    expect(seleccionarRotulos(edificios, 2, true)).toHaveLength(2);
  });
  it.each([true, false])(
    'ningún par de rótulos del campus se superpone (compacto=%s)',
    (compacto) => {
      for (const zoom of [0.4, 0.6, 1, 2, 4]) {
        const rotulos = seleccionarRotulos(campus.buildings, zoom, compacto);
        for (let i = 0; i < rotulos.length; i++)
          for (let j = i + 1; j < rotulos.length; j++) {
            const a = rotulos[i]!.caja,
              b = rotulos[j]!.caja;
            expect(
              a.izquierda >= b.derecha ||
                a.derecha <= b.izquierda ||
                a.arriba >= b.abajo ||
                a.abajo <= b.arriba,
            ).toBe(true);
          }
      }
    },
  );
  it('los nombres caben en dos líneas y conservan las coordenadas originales', () => {
    const copia = structuredClone(campus.buildings);
    const rotulos = seleccionarRotulos(campus.buildings, 2, true);
    expect(rotulos.length).toBeGreaterThan(0);
    expect(
      rotulos.every((r) => r.lineas.length <= 2 && r.lineas.every((linea) => linea.length <= 25)),
    ).toBe(true);
    expect(campus.buildings).toEqual(copia);
    expect(lineasDelRotulo('Facultad de Ciencias Naturales y Oceanográficas', 25)[1]).toContain(
      '…',
    );
  });
});
