import { describe, expect, it } from 'vitest';
import { bounds, parseDxf } from './parse';

/** Construye un DXF ASCII a partir de pares (código, valor). */
const dxf = (...pairs: (string | number)[]) => pairs.join('\n') + '\n';

// prettier-ignore
const SAMPLE = dxf(
  0, 'SECTION', 2, 'BLOCKS',
  0, 'BLOCK', 2, 'CUADRADO',
  0, 'LWPOLYLINE', 8, '0', 90, 4, 70, 1,
  10, 0, 20, 0,
  10, 10, 20, 0,
  10, 10, 20, 10,
  10, 0, 20, 10,
  0, 'ENDBLK',
  0, 'ENDSEC',
  0, 'SECTION', 2, 'ENTITIES',
  0, 'LINE', 8, 'EJES', 10, 0, 20, 0, 11, 100, 21, 50,
  0, 'INSERT', 8, 'EDIFICIOS', 2, 'CUADRADO', 10, 100, 20, 200, 41, 2, 42, 2, 50, 0,
  0, 'TEXT', 8, 'TEXTOS', 10, 5, 20, 5, 1, 'Facultad',
  0, 'HATCH', 8, 'RELLENOS',
  0, 'ENDSEC',
  0, 'EOF',
);

// prettier-ignore
const ROTADO = dxf(
  0, 'SECTION', 2, 'BLOCKS',
  0, 'BLOCK', 2, 'B',
  0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0,
  0, 'ENDBLK',
  0, 'ENDSEC',
  0, 'SECTION', 2, 'ENTITIES',
  0, 'INSERT', 8, 'C', 2, 'B', 10, 0, 20, 0, 50, 90,
  0, 'ENDSEC',
  0, 'EOF',
);

describe('parseDxf', () => {
  const doc = parseDxf(SAMPLE);

  it('lee entidades y sus capas', () => {
    expect(doc.shapes.map((s) => `${s.layer}:${s.type}`)).toEqual([
      'EJES:LINE',
      'EDIFICIOS:LWPOLYLINE',
      'TEXTOS:TEXT',
    ]);
    expect(doc.shapes[2]!.text).toBe('Facultad');
  });

  it('expande bloques aplicando escala y traslación', () => {
    const cuadrado = doc.shapes[1]!;
    expect(cuadrado.closed).toBe(true);
    expect(cuadrado.paths[0]).toEqual([
      [100, 200],
      [120, 200],
      [120, 220],
      [100, 220],
    ]);
  });

  it('cuenta las entidades que no sabe interpretar', () => {
    expect(doc.skipped.get('HATCH')).toBe(1);
    expect(doc.blocks).toBe(1);
  });

  it('calcula la extensión del dibujo', () => {
    expect(bounds(doc.shapes)).toEqual({ minX: 0, minY: 0, maxX: 120, maxY: 220 });
  });

  it('rota los bloques', () => {
    const [, end] = parseDxf(ROTADO).shapes[0]!.paths[0]!;
    expect(end![0]).toBeCloseTo(0, 6);
    expect(end![1]).toBeCloseTo(10, 6);
  });
});
