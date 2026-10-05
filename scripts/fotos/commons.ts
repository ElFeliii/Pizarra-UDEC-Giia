/**
 * Cliente mínimo de Wikimedia Commons: consulta la ficha de un archivo (autor, licencia,
 * página de origen) y descarga la versión reducida que se publica en el sitio.
 *
 * Commons pide identificarse y no golpear la API: todas las llamadas van espaciadas.
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const CONTACTO = process.env.COMMONS_CONTACT ?? 'equipo Pizarra UdeC';
const UA = `PizarraUdeC/0.1 (proyecto universitario; ${CONTACTO})`;
const PAUSA_MS = 1200;

export interface FichaCommons {
  titulo: string;
  autor: string;
  licencia: string;
  pagina: string;
  ancho: number;
  alto: number;
}

let ultima = 0;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function espaciado<T>(fn: () => Promise<T>): Promise<T> {
  const falta = PAUSA_MS - (Date.now() - ultima);
  if (falta > 0) await dormir(falta);
  ultima = Date.now();
  return fn();
}

async function pedir(url: string): Promise<Response> {
  for (let intento = 1; intento <= 5; intento++) {
    const res = await espaciado(() => fetch(url, { headers: { 'User-Agent': UA } }));
    if (res.ok) return res;
    if (intento === 5) throw new Error(`Commons respondió ${res.status}: ${url}`);
    await dormir(3000 * intento);
  }
  throw new Error('inalcanzable');
}

/** Quita el HTML que la API entrega en los campos de texto libre. */
function texto(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fichas(titulos: string[]): Promise<Map<string, FichaCommons>> {
  const salida = new Map<string, FichaCommons>();
  for (let i = 0; i < titulos.length; i += 25) {
    const lote = titulos.slice(i, i + 25);
    const url =
      `${API}?` +
      new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        titles: lote.map((t) => `File:${t}`).join('|'),
        prop: 'imageinfo',
        iiprop: 'url|size|extmetadata',
        iiextmetadatafilter: 'LicenseShortName|Artist',
      });
    const datos = (await (await pedir(url)).json()) as {
      query?: {
        pages?: {
          title: string;
          imageinfo?: {
            width: number;
            height: number;
            descriptionurl: string;
            extmetadata?: Record<string, { value?: unknown }>;
          }[];
        }[];
      };
    };
    for (const pagina of datos.query?.pages ?? []) {
      const info = pagina.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata ?? {};
      salida.set(pagina.title.replace(/^File:/, ''), {
        titulo: pagina.title.replace(/^File:/, ''),
        autor: texto(meta.Artist?.value) || 'Autor no indicado',
        licencia: texto(meta.LicenseShortName?.value),
        pagina: info.descriptionurl,
        ancho: info.width,
        alto: info.height,
      });
    }
  }
  return salida;
}

/** Descarga la miniatura del ancho pedido. `Special:FilePath` resuelve la URL real. */
export async function descargar(titulo: string, ancho: number): Promise<Buffer> {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    titulo.replace(/ /g, '_'),
  )}?width=${ancho}`;
  const res = await pedir(url);
  return Buffer.from(await res.arrayBuffer());
}
