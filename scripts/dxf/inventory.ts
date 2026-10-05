/**
 * Inventario visual de un plano DXF: qué trae cada capa y cómo se ve.
 *
 *   npx tsx scripts/dxf/inventory.ts "assets/mapa/Campus UdeC.dxf"
 *   npx tsx scripts/dxf/inventory.ts plano.dxf --out assets/mapa/capas --top 40
 *   npx tsx scripts/dxf/inventory.ts plano.dxf --layers EDIFICIOS,CALLES --svg base.svg
 *
 * Genera una página `capas.html` con la vista previa de cada capa para elegir cuáles sirven.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bounds, parseDxf, type Bounds, type Shape } from './parse';

interface Args {
  file: string;
  out: string;
  top: number;
  layers: string[] | null;
  svg: string | null;
}

function parseArgs(argv: string[]): Args {
  const [file] = argv;
  if (!file) {
    console.error(
      'Uso: tsx scripts/dxf/inventory.ts <archivo.dxf> [--out dir] [--top N] [--layers A,B] [--svg salida.svg]',
    );
    process.exit(1);
  }
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };
  return {
    file,
    out: get('out') ?? 'assets/mapa/capas',
    top: Number(get('top') ?? 60),
    layers:
      get('layers')
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? null,
    svg: get('svg'),
  };
}

const safeName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'capa';

const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 0 });

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** SVG de un conjunto de trazos. El eje Y se invierte: en CAD crece hacia arriba. */
function toSvg(
  shapes: Shape[],
  box: Bounds,
  opts: { width?: number; stroke?: number } = {},
): string {
  const w = box.maxX - box.minX || 1;
  const h = box.maxY - box.minY || 1;
  const stroke = opts.stroke ?? Math.max(w, h) / 900;
  const fontSize = Math.max(w, h) / 90;
  const paths: string[] = [];
  for (const s of shapes) {
    if (s.text) {
      // Los rótulos se dibujan de verdad: suelen decir qué edificio es cada silueta.
      const [x, y] = s.paths[0]?.[0] ?? [0, 0];
      paths.push(
        `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(1,-1)">` +
          `<text font-size="${fontSize.toFixed(2)}" fill="#1c2024" stroke="none">${escapeXml(s.text.slice(0, 40))}</text></g>`,
      );
      continue;
    }
    for (const path of s.paths) {
      if (path.length < 2) {
        const [x, y] = path[0] ?? [0, 0];
        paths.push(
          `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(stroke * 2).toFixed(2)}"/>`,
        );
        continue;
      }
      const d =
        path.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') +
        (s.closed ? ' Z' : '');
      paths.push(`<path d="${d}"/>`);
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX.toFixed(2)} ${(-box.maxY).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}"`,
    opts.width ? ` width="${opts.width}"` : '',
    '>',
    `<g transform="scale(1,-1)" fill="none" stroke="#1c2024" stroke-width="${stroke.toFixed(3)}" stroke-linejoin="round" stroke-linecap="round">`,
    paths.join(''),
    '</g></svg>',
  ].join('');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.file, 'latin1');
  const doc = parseDxf(text);
  const all = bounds(doc.shapes);
  if (!all) {
    console.error('No se encontró geometría en el archivo. ¿Es un DXF ASCII?');
    process.exit(1);
  }

  // Agrupar por capa.
  const byLayer = new Map<string, Shape[]>();
  for (const s of doc.shapes) {
    const list = byLayer.get(s.layer) ?? [];
    list.push(s);
    byLayer.set(s.layer, list);
  }
  const layers = [...byLayer.entries()]
    .map(([name, shapes]) => {
      const types = new Map<string, number>();
      for (const s of shapes) types.set(s.type, (types.get(s.type) ?? 0) + 1);
      const b = bounds(shapes)!;
      return {
        name,
        shapes,
        count: shapes.length,
        types: [...types].sort((a, b2) => b2[1] - a[1]),
        samples: shapes
          .map((s) => s.text)
          .filter((t): t is string => !!t)
          .slice(0, 4),
        box: b,
        /** Qué porcentaje del plano cubre: una capa de cotas suele cubrirlo entero. */
        coverage:
          ((b.maxX - b.minX) * (b.maxY - b.minY)) / ((all.maxX - all.minX) * (all.maxY - all.minY)),
      };
    })
    .sort((a, b) => b.count - a.count);

  console.log(`\nArchivo: ${basename(args.file)}`);
  console.log(
    `Elementos con geometría: ${fmt(doc.shapes.length)} · capas: ${layers.length} · bloques: ${doc.blocks}`,
  );
  console.log(
    `Extensión: ${fmt(all.maxX - all.minX)} x ${fmt(all.maxY - all.minY)} unidades de dibujo\n`,
  );
  console.log('capa'.padEnd(34) + 'elementos'.padStart(10) + '  tipos');
  console.log('-'.repeat(88));
  for (const l of layers.slice(0, args.top)) {
    const types = l.types.map(([t, n]) => `${t}:${fmt(n)}`).join(' ');
    console.log(`${l.name.slice(0, 33).padEnd(34)}${fmt(l.count).padStart(10)}  ${types}`);
  }
  if (doc.skipped.size) {
    const s = [...doc.skipped].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${fmt(n)}`);
    console.log(`\nEntidades no interpretadas (no aportan trazos): ${s.join(' ')}`);
  }

  // Si se piden capas concretas, se emite un único SVG combinado y se termina.
  if (args.layers) {
    const wanted = new Set(args.layers.map((l) => l.toLowerCase()));
    const picked = doc.shapes.filter((s) => wanted.has(s.layer.toLowerCase()));
    const box = bounds(picked);
    if (!box) {
      console.error('\nNinguna de esas capas tiene geometría. Revisa los nombres.');
      process.exit(1);
    }
    const out = args.svg ?? 'assets/mapa/base.svg';
    writeFileSync(out, toSvg(picked, box));
    console.log(`\n${fmt(picked.length)} elementos de ${args.layers.length} capas → ${out}`);
    return;
  }

  // Vistas previas + galería HTML.
  mkdirSync(args.out, { recursive: true });
  const cards: string[] = [];
  writeFileSync(join(args.out, 'todo.svg'), toSvg(doc.shapes, all));
  for (const l of layers.slice(0, args.top)) {
    const file = `${safeName(l.name)}.svg`;
    // Todas las capas se dibujan con la extensión completa del plano: así se ve dónde está cada una.
    writeFileSync(join(args.out, file), toSvg(l.shapes, all));
    const samples = l.samples.length
      ? `<span>“${l.samples.map(escapeXml).join('”, “')}”</span>`
      : '';
    cards.push(
      `<figure><img src="${file}" alt="${escapeXml(l.name)}" loading="lazy"><figcaption><b>${escapeXml(l.name)}</b>` +
        `<span>${fmt(l.count)} elementos · ${l.types
          .slice(0, 3)
          .map(([t, n]) => `${t} ${fmt(n)}`)
          .join(', ')}</span>${samples}</figcaption></figure>`,
    );
  }
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Capas del plano</title>
<style>
  body{font:15px system-ui,sans-serif;margin:24px;background:#f7f8fa;color:#1c2024}
  h1{font-size:20px} p{color:#60646c}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
  figure{margin:0;background:#fff;border:1px solid #e6e8ec;border-radius:12px;padding:10px}
  img{width:100%;height:190px;object-fit:contain;background:#fff}
  figcaption{display:flex;flex-direction:column;gap:2px;margin-top:8px;font-size:13px}
  figcaption span{color:#7a808a}
</style>
<h1>Capas de ${basename(args.file)}</h1>
<p>${fmt(doc.shapes.length)} elementos en ${layers.length} capas. Mira cuáles contienen las siluetas de los edificios, los caminos y las áreas verdes.</p>
<div class="grid"><figure><img src="todo.svg" alt="todo"><figcaption><b>TODO EL PLANO</b><span>${fmt(doc.shapes.length)} elementos</span></figcaption></figure>${cards.join('')}</div>
</html>`;
  writeFileSync(join(args.out, 'capas.html'), html);
  console.log(`\nVistas previas en ${join(args.out, 'capas.html')}`);
}

main();
