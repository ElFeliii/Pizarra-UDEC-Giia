import type { BannedWordMode } from '@pizarra/shared';
import { WILD, matchCandidates, normalizeTermParts, squeeze1, type Candidates } from './normalize';

export interface CensorTerm {
  term: string;
  mode: BannedWordMode;
}

interface CompiledTerm {
  norm: string;
  mode: BannedWordMode;
  /** true si el término no tiene letras dobles: también se compara contra la forma squeeze1. */
  single: boolean;
  /** Frases de varias palabras ("sieg heil"): se buscan como secuencia de tokens. */
  parts?: string[];
}

function matchesToken(t: CompiledTerm, token: string): boolean {
  switch (t.mode) {
    case 'exact':
      return token === t.norm;
    case 'prefix':
      return token.startsWith(t.norm);
    case 'contains':
      return token.includes(t.norm);
  }
}

/**
 * Largo mínimo para comparar contra palabras pegadas ("im bec il"). Con términos cortos, pegar
 * palabras cualesquiera formaría coincidencias que nadie escribió ("mi" + "erda").
 */
const MIN_PEGADO = 6;

/**
 * Compara `term` contra `token` desde la posición `at`, donde el comodín vale cualquier letra.
 * Se admite un solo comodín dentro de lo comparado: con dos o más, patrones inocentes como
 * "c.e.i.a" terminarían calzando con cualquier término de la lista.
 */
function calzaDesde(token: string, term: string, at: number): boolean {
  let comodines = 0;
  for (let i = 0; i < term.length; i++) {
    const ch = token[at + i];
    if (ch === undefined) return false;
    if (ch === WILD) {
      if (++comodines > 1) return false;
      continue;
    }
    if (ch !== term[i]) return false;
  }
  return true;
}

/** Igual que `matchesToken`, pero sobre un patrón con comodines ("imecil"). */
function matchesWildcard(t: CompiledTerm, patron: string): boolean {
  switch (t.mode) {
    case 'exact':
      return patron.length === t.norm.length && calzaDesde(patron, t.norm, 0);
    case 'prefix':
      return patron.length >= t.norm.length && calzaDesde(patron, t.norm, 0);
    case 'contains':
      for (let i = 0; i + t.norm.length <= patron.length; i++) {
        if (calzaDesde(patron, t.norm, i)) return true;
      }
      return false;
  }
}

/** Una frase coincide si sus palabras aparecen seguidas; la última admite el modo del término. */
function matchesPhrase(t: CompiledTerm, c: Candidates): boolean {
  const parts = t.parts!;
  for (const seq of c.sequences) {
    for (let i = 0; i + parts.length <= seq.length; i++) {
      let ok = true;
      for (let j = 0; j < parts.length && ok; j++) {
        const token = seq[i + j]!;
        const part = parts[j]!;
        ok = j === parts.length - 1 ? matchesToken({ ...t, norm: part }, token) : token === part;
      }
      if (ok) return true;
    }
  }
  return false;
}

function matchesCandidates(t: CompiledTerm, c: Candidates): boolean {
  if (t.parts) return matchesPhrase(t, c);
  const pegados = t.norm.length >= MIN_PEGADO ? c.pegados : null;

  // Un término exacto es una búsqueda en el conjunto: no hace falta recorrer los tokens.
  // Es la mitad de la lista, y las formas pegadas de un mensaje largo son varios cientos.
  if (t.mode === 'exact') {
    if (c.squeezed2.has(t.norm)) return true;
    // Los términos sin letras dobles se comparan también contra la forma totalmente reducida
    // ("weoon" → "weon"). Los que sí tienen dobles ("perra") no, para no bloquear "pera".
    if (t.single && c.squeezed1.has(t.norm)) return true;
    if (pegados?.has(t.norm)) return true;
  } else {
    for (const token of c.squeezed2) if (matchesToken(t, token)) return true;
    if (t.single) for (const token of c.squeezed1) if (matchesToken(t, token)) return true;
    if (pegados) for (const token of pegados) if (matchesToken(t, token)) return true;
  }

  for (const patron of c.wildcards) if (matchesWildcard(t, patron)) return true;
  if (pegados) for (const patron of c.wildcardsDigito) if (matchesWildcard(t, patron)) return true;
  return false;
}

function compile(terms: CensorTerm[]): CompiledTerm[] {
  const out: CompiledTerm[] = [];
  const seen = new Set<string>();
  for (const { term, mode } of terms) {
    const parts = normalizeTermParts(term);
    const norm = parts.join('');
    if (norm.length < 2 || parts.length === 0) continue;
    const key = `${mode}:${parts.join(' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      norm,
      mode,
      single: squeeze1(norm) === norm,
      ...(parts.length > 1 ? { parts } : {}),
    });
  }
  return out;
}

/**
 * Filtro de palabras compilado en memoria. `setTerms` lo reconstruye en caliente
 * cuando el moderador edita la lista.
 */
export class Censor {
  private compiled: CompiledTerm[] = [];

  constructor(terms: CensorTerm[] = []) {
    this.setTerms(terms);
  }

  setTerms(terms: CensorTerm[]): void {
    this.compiled = compile(terms);
  }

  get size(): number {
    return this.compiled.length;
  }

  /** true si el texto contiene alguna palabra prohibida. */
  isBlocked(text: string): boolean {
    if (this.compiled.length === 0) return false;
    const c = matchCandidates(text);
    return this.compiled.some((t) => matchesCandidates(t, c));
  }

  /** Crea un matcher de un solo término (para aplicar una palabra nueva al contenido existente). */
  static single(term: CensorTerm): Censor {
    return new Censor([term]);
  }
}
