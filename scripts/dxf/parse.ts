/**
 * Lector mínimo de DXF (ASCII) para inspeccionar un plano CAD: qué capas trae, con cuántos
 * elementos y de qué tipo. No pretende ser un lector completo; solo lo necesario para decidir
 * qué capas sirven para el mapa del campus.
 *
 * Soporta LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC, SOLID, POINT, TEXT/MTEXT y expande
 * INSERT (bloques) aplicando traslación, escala y rotación.
 */

export interface Pair {
  code: number;
  value: string;
}

/** Un DXF es una lista de pares (código, valor), uno por par de líneas. */
export function readPairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1]!.trim() });
  }
  return pairs;
}

export type Point = [number, number];

export interface Shape {
  layer: string;
  type: string;
  /** Polilíneas ya resueltas en coordenadas del dibujo (una o más). */
  paths: Point[][];
  closed: boolean;
  /** Texto, solo para inventario. */
  text?: string;
}

interface RawEntity {
  type: string;
  layer: string;
  pairs: Pair[];
}

const ARC_SEGMENTS = 24;

function num(e: RawEntity, code: number, fallback = 0): number {
  const p = e.pairs.find((x) => x.code === code);
  return p ? Number(p.value) || 0 : fallback;
}

function str(e: RawEntity, code: number, fallback = ''): string {
  return e.pairs.find((x) => x.code === code)?.value ?? fallback;
}

function arcPoints(cx: number, cy: number, r: number, from: number, to: number): Point[] {
  const a0 = (from * Math.PI) / 180;
  let a1 = (to * Math.PI) / 180;
  if (a1 <= a0) a1 += Math.PI * 2;
  const pts: Point[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const a = a0 + ((a1 - a0) * i) / ARC_SEGMENTS;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Convierte una entidad cruda en trazos; devuelve null si no aporta geometría. */
function toShape(e: RawEntity): Shape | null {
  const layer = e.layer || '0';
  switch (e.type) {
    case 'LINE':
      return {
        layer,
        type: e.type,
        closed: false,
        paths: [
          [
            [num(e, 10), num(e, 20)],
            [num(e, 11), num(e, 21)],
          ],
        ],
      };
    case 'LWPOLYLINE': {
      const xs = e.pairs.filter((p) => p.code === 10).map((p) => Number(p.value));
      const ys = e.pairs.filter((p) => p.code === 20).map((p) => Number(p.value));
      const pts: Point[] = xs.map((x, i) => [x, ys[i] ?? 0]);
      if (pts.length < 2) return null;
      return { layer, type: e.type, closed: (num(e, 70) & 1) === 1, paths: [pts] };
    }
    case 'CIRCLE':
      return {
        layer,
        type: e.type,
        closed: true,
        paths: [arcPoints(num(e, 10), num(e, 20), num(e, 40), 0, 360)],
      };
    case 'ARC':
      return {
        layer,
        type: e.type,
        closed: false,
        paths: [arcPoints(num(e, 10), num(e, 20), num(e, 40), num(e, 50), num(e, 51))],
      };
    case 'SOLID':
    case '3DFACE': {
      const pts: Point[] = [
        [num(e, 10), num(e, 20)],
        [num(e, 11), num(e, 21)],
        [num(e, 12), num(e, 22)],
        [num(e, 13), num(e, 23)],
      ];
      return { layer, type: e.type, closed: true, paths: [pts] };
    }
    case 'POINT':
      return { layer, type: e.type, closed: false, paths: [[[num(e, 10), num(e, 20)]]] };
    case 'TEXT':
    case 'MTEXT':
      return {
        layer,
        type: e.type,
        closed: false,
        paths: [[[num(e, 10), num(e, 20)]]],
        text: str(e, 1),
      };
    default:
      return null;
  }
}

function transform(
  shape: Shape,
  ins: { x: number; y: number; sx: number; sy: number; rot: number },
): Shape {
  const a = (ins.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    ...shape,
    paths: shape.paths.map((path) =>
      path.map(([x, y]) => {
        const sx = x * ins.sx;
        const sy = y * ins.sy;
        return [ins.x + sx * cos - sy * sin, ins.y + sx * sin + sy * cos] as Point;
      }),
    ),
  };
}

export interface DxfDocument {
  shapes: Shape[];
  /** Entidades que no se convirtieron (tipo → cantidad), para saber qué se está perdiendo. */
  skipped: Map<string, number>;
  blocks: number;
}

const MAX_BLOCK_DEPTH = 5;

export function parseDxf(text: string): DxfDocument {
  const pairs = readPairs(text);

  // 1. Separar secciones y agrupar entidades por su código 0.
  const blockEntities = new Map<string, RawEntity[]>();
  const entities: RawEntity[] = [];
  let section = '';
  let blockName: string | null = null;
  let current: RawEntity | null = null;

  const push = () => {
    if (!current) return;
    if (section === 'ENTITIES') entities.push(current);
    else if (section === 'BLOCKS' && blockName) {
      const list = blockEntities.get(blockName) ?? [];
      list.push(current);
      blockEntities.set(blockName, list);
    }
    current = null;
  };

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i]!;
    if (code === 0) {
      push();
      if (value === 'SECTION') {
        section = pairs[i + 1]?.code === 2 ? (pairs[i + 1]!.value ?? '') : '';
        continue;
      }
      if (value === 'ENDSEC') {
        section = '';
        blockName = null;
        continue;
      }
      if (value === 'BLOCK') {
        // El nombre del bloque llega en el código 2 dentro de la propia entidad BLOCK.
        for (let j = i + 1; j < pairs.length && pairs[j]!.code !== 0; j++) {
          if (pairs[j]!.code === 2) {
            blockName = pairs[j]!.value;
            break;
          }
        }
        continue;
      }
      if (value === 'ENDBLK') {
        blockName = null;
        continue;
      }
      current = { type: value, layer: '0', pairs: [] };
      continue;
    }
    if (!current) continue;
    if (code === 8) current.layer = value;
    current.pairs.push({ code, value });
  }
  push();

  const skipped = new Map<string, number>();
  const shapes: Shape[] = [];

  type Insert = { x: number; y: number; sx: number; sy: number; rot: number };

  const composeInsert = (parent: Insert, child: Insert): Insert => {
    const a = (parent.rot * Math.PI) / 180;
    const cx = child.x * parent.sx;
    const cy = child.y * parent.sy;
    return {
      x: parent.x + cx * Math.cos(a) - cy * Math.sin(a),
      y: parent.y + cx * Math.sin(a) + cy * Math.cos(a),
      sx: parent.sx * child.sx,
      sy: parent.sy * child.sy,
      rot: parent.rot + child.rot,
    };
  };

  const expand = (list: RawEntity[], depth: number, at?: Insert, insertLayer?: string) => {
    for (const e of list) {
      if (e.type === 'INSERT') {
        if (depth >= MAX_BLOCK_DEPTH) continue;
        const inner = blockEntities.get(str(e, 2));
        if (!inner) continue;
        const local: Insert = {
          x: num(e, 10),
          y: num(e, 20),
          sx: num(e, 41, 1) || 1,
          sy: num(e, 42, 1) || 1,
          rot: num(e, 50),
        };
        // Los bloques anidados componen su transformación con la del padre.
        expand(inner, depth + 1, at ? composeInsert(at, local) : local, e.layer || insertLayer);
        continue;
      }
      const shape = toShape(e);
      if (!shape) {
        skipped.set(e.type, (skipped.get(e.type) ?? 0) + 1);
        continue;
      }
      // Convención CAD: lo que está en la capa "0" dentro de un bloque hereda la capa del INSERT.
      if (shape.layer === '0' && insertLayer) shape.layer = insertLayer;
      shapes.push(at ? transform(shape, at) : shape);
    }
  };

  expand(entities, 0);
  return { shapes, skipped, blocks: blockEntities.size };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(shapes: Shape[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    for (const path of s.paths) {
      for (const [x, y] of path) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
