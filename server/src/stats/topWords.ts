import { TOP_WORDS_COUNT, type TopWord } from '@pizarra/shared';
import type { WordCountsRepo } from '../db/repos/words';
import type { Censor } from '../moderation/censor';
import { foldCase, sanitizeText, squeeze2 } from '../moderation/normalize';
import { STOPWORDS } from './stopwords.es';

const LAUGH = /^(?:[jh][aeiou]){2,}[jh]?$|^x+d+$/;

/**
 * Palabras "contables" de un texto: clave normalizada → forma para mostrar.
 * Cada palabra cuenta una vez por mensaje, así repetirla no infla el ranking.
 */
export function tokenizeForStats(text: string, censor: Censor): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of sanitizeText(text).split(/[^\p{L}]+/u)) {
    const display = raw.toLowerCase();
    const key = squeeze2(foldCase(display));
    if (key.length < 3 || key.length > 30) continue;
    if (STOPWORDS.has(key) || LAUGH.test(key)) continue;
    if (out.has(key) || censor.isBlocked(key)) continue;
    out.set(key, display);
  }
  return out;
}

/** Contador incremental de palabras + caché del top N. */
export class TopWords {
  private cache: TopWord[] = [];
  private dirty = true;
  private lastSent = '';

  constructor(
    private readonly repo: WordCountsRepo,
    private readonly censor: Censor,
  ) {}

  /** Llamar dentro de la transacción que guarda / oculta el contenido. */
  apply(text: string, delta: 1 | -1): void {
    const words = tokenizeForStats(text, this.censor);
    if (words.size === 0) return;
    this.repo.apply(words, delta);
    this.dirty = true;
  }

  /** Forzar recálculo (p. ej. cuando cambia la lista de palabras prohibidas). */
  invalidate(): void {
    this.dirty = true;
  }

  /** Repara contadores anteriores al arrancar o cambiar el filtro, nunca por cada mensaje. */
  reconstruir(): void {
    this.repo.reemplazar(
      this.repo.textosVisibles().map((texto) => tokenizeForStats(texto, this.censor)),
    );
    this.invalidate();
  }

  ajustarVisibilidad(anteriores: string[], siguientes: string[]): void {
    for (const texto of anteriores) this.apply(texto, -1);
    for (const texto of siguientes) this.apply(texto, 1);
  }

  top(): TopWord[] {
    if (this.dirty) {
      this.cache = this.repo
        .top(TOP_WORDS_COUNT * 2)
        .filter((w) => !this.censor.isBlocked(w.word))
        .slice(0, TOP_WORDS_COUNT);
      this.dirty = false;
    }
    return this.cache;
  }

  /** Devuelve el top si cambió desde la última difusión; si no, null. */
  takeChanged(): TopWord[] | null {
    const top = this.top();
    const key = JSON.stringify(top);
    if (key === this.lastSent) return null;
    this.lastSent = key;
    return top;
  }
}
