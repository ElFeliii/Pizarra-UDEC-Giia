/**
 * Normalización de texto para almacenamiento y para el filtro de palabras.
 *
 * Dos usos distintos:
 *  - `sanitizeText`: limpia lo que se guarda y se muestra (quita invisibles, ordena saltos de línea).
 *  - `matchCandidates`: produce las formas "canónicas" contra las que se compara la lista de
 *    palabras prohibidas (sin tildes, sin leetspeak, sin letras estiradas, uniendo letras sueltas).
 */

// Caracteres de control, de formato y "rellenos" invisibles usados para evadir filtros.
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;

/** Limpia un texto antes de guardarlo. No cambia letras ni tildes. */
export function sanitizeText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const N_TILDE = '\u0001';

/** Minúsculas y sin tildes, pero conservando la ñ ("coño" ≠ "cono"). */
export function foldCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/ñ/g, N_TILDE)
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(new RegExp(N_TILDE, 'g'), 'ñ');
}

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '8': 'b',
  // La k por c es la evasión chilena de siempre ("kuliao", "ktm"); en español casi no hay k.
  k: 'c',
};
const LEET_RE = /[0134578@$!k]/g;

/** Reduce repeticiones de 3+ letras iguales a 2 ("weoooon" → "weoon"). */
export function squeeze2(token: string): string {
  return token.replace(/(.)\1{2,}/g, '$1$1');
}

/** Reduce toda repetición a 1 letra ("weoon" → "weon"). */
export function squeeze1(token: string): string {
  return token.replace(/(.)\1+/g, '$1');
}

function splitTokens(folded: string): string[] {
  return folded.split(/[^a-zñ0-9]+/).filter(Boolean);
}

/**
 * Tokens adicionales que aparecen al unir fragmentos cortos:
 *  - rachas de tokens de ≤2 caracteres ("w e o n", "c.t.m", "we o n") → "weon", "ctm";
 *  - pares donde uno de los dos es corto ("pu ta", "weo n") → "puta", "weon".
 */
function joinFragments(tokens: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push(run.join(''));
    run = [];
  };
  for (const t of tokens) {
    if (t.length <= 2) run.push(t);
    else flush();
  }
  flush();
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    if (a.length <= 2 || b.length <= 2) out.push(a + b);
  }
  return out;
}

/** Marca de "aquí iba una letra que no sabemos" en los patrones con comodín. */
export const WILD = '\u0002';

/**
 * Palabras donde un símbolo ocupa el lugar de una letra ("im{ecil", "we*n", "pu+a"): cada
 * racha de símbolos internos se convierte en un comodín de un carácter. Es el caso que los
 * tokens normales pierden, porque ahí el símbolo actúa como separador y la letra desaparece.
 */
function wildcardTokens(folded: string): { simbolo: string[]; digito: string[] } {
  const simbolo: string[] = [];
  const digito: string[] = [];
  // Más de dos comodines en una palabra ya no es "una letra disfrazada" sino separadores
  // ("w.e.o.n"), y eso lo cubre joinFragments. Dejarlos pasar haría calzar cualquier cosa.
  const util = (patron: string) => patron.length <= 40 && patron.split(WILD).length - 1 <= 2;
  for (const palabra of folded.split(/\s+/)) {
    const nucleo = palabra.replace(/^[^a-zñ0-9]+/, '').replace(/[^a-zñ0-9]+$/, '');
    const letras = nucleo.replace(/[^a-zñ]/g, '').length;
    if (letras < 2) continue;
    if (/[^a-zñ0-9]/.test(nucleo)) {
      const p = squeeze2(nucleo.replace(/[^a-zñ0-9]+/g, WILD));
      if (util(p)) simbolo.push(p);
    }
    // Un dígito también puede estar ocupando el lugar de una letra ("im8ecil"). Se exige una
    // palabra con cuerpo para no volver comodines a "4to" ni a "2x1".
    if (letras >= 4 && /[0-9]/.test(nucleo)) {
      const p = squeeze2(nucleo.replace(/[^a-zñ]+/g, WILD));
      if (util(p)) digito.push(p);
    }
  }
  return { simbolo, digito };
}

/** Largo máximo de cada trozo para considerarlo un pedazo de palabra partida. */
const TROZO_MAX = 4;
/** Cuántos trozos seguidos se prueban pegados ("con che tu ma re"). */
const VENTANA_TROZOS = 5;
/** Largo máximo de lo pegado: más allá ya no es una palabra. */
const PEGADO_MAX = 24;

/**
 * Palabras partidas en varios pedazos ("im bec il", "con che tu ma re"). Se pega cada racha de
 * trozos cortos seguidos, en ventanas de hasta cinco, y también cada par de palabras contiguas
 * sin importar su largo ("imbeci l").
 *
 * Lo pegado solo se compara con términos largos (ver MIN_PEGADO en censor.ts): juntar palabras
 * al azar puede formar una palabra corta prohibida que nadie escribió.
 */
function joinFragmentsRuns(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) out.push(tokens[i]! + tokens[i + 1]!);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.length > TROZO_MAX) continue;
    let pegado = tokens[i]!;
    for (let j = i + 1; j < tokens.length && j - i < VENTANA_TROZOS; j++) {
      const trozo = tokens[j]!;
      if (trozo.length > TROZO_MAX) break;
      pegado += trozo;
      if (pegado.length > PEGADO_MAX) break;
      out.push(pegado);
    }
  }
  return out;
}

export interface Candidates {
  /** Tokens con repeticiones de 3+ reducidas a 2. */
  squeezed2: Set<string>;
  /** Tokens con toda repetición reducida a 1. */
  squeezed1: Set<string>;
  /** Los tokens en orden (una secuencia por variante), para buscar frases. */
  sequences: string[][];
  /** Patrones con comodín por un símbolo que reemplaza una letra ("im{ecil", "we*n"). */
  wildcards: string[];
  /**
   * Patrones con comodín por un dígito ("im8ecil"). Solo valen para términos largos: los
   * dígitos aparecen en texto normal (códigos, siglas, identificadores), y con un término
   * corto el comodín dejaría casi todo calzando ("fu1kt" con "fuck").
   */
  wildcardsDigito: string[];
  /**
   * Palabras partidas y vueltas a pegar. Solo se comparan con términos largos: pegar palabras
   * al azar puede formar una palabra corta prohibida sin que nadie lo haya escrito.
   */
  pegados: Set<string>;
}

/**
 * Todas las formas de un texto contra las que se compara la lista prohibida.
 * Se generan dos variantes: con símbolos como separadores ("ctm!" → "ctm") y con
 * leetspeak traducido ("w3on" → "weon").
 */
export function matchCandidates(text: string): Candidates {
  const folded = foldCase(sanitizeText(text));
  const plain = splitTokens(folded);
  const leet = splitTokens(folded.replace(LEET_RE, (c) => LEET[c] ?? c));

  const squeezed2 = new Set<string>();
  const squeezed1 = new Set<string>();
  const sequences: string[][] = [];
  const pegados = new Set<string>();
  for (const tokens of [plain, leet]) {
    sequences.push(tokens.map(squeeze2));
    for (const t of [...tokens, ...joinFragments(tokens)]) {
      const s2 = squeeze2(t);
      squeezed2.add(s2);
      squeezed1.add(squeeze1(s2));
    }
    for (const t of joinFragmentsRuns(tokens)) pegados.add(squeeze2(t));
  }
  const llano = wildcardTokens(folded);
  const leetado = wildcardTokens(folded.replace(LEET_RE, (c) => LEET[c] ?? c));
  return {
    squeezed2,
    squeezed1,
    sequences,
    wildcards: [...llano.simbolo, ...leetado.simbolo],
    wildcardsDigito: [...llano.digito, ...leetado.digito],
    pegados,
  };
}

/** Forma canónica de un término de la lista prohibida (una sola palabra). */
export function normalizeTerm(term: string): string {
  return squeeze2(foldCase(term.trim()).replace(/[^a-zñ0-9]/g, ''));
}

/**
 * Un término puede ser una frase ("sieg heil"): se normaliza palabra por palabra, porque el
 * odio muchas veces no cabe en una sola.
 */
export function normalizeTermParts(term: string): string[] {
  return foldCase(term.trim())
    .split(/[^a-zñ0-9]+/)
    .filter(Boolean)
    .map(squeeze2);
}
