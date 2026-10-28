import type { DecisionIa, RegistroIa, ResumenIa } from '@pizarra/shared';
import type { ModeracionIaConfig } from '../config';
import type { AppContext } from '../context';
import { CONTEXTO_PIZARRA, NORMAS } from './normas';

const MODERATIONS_URL = 'https://api.openai.com/v1/moderations';
const DECISIONS_URL = 'https://api.openai.com/v1/decisions';
const PUNTAJES_VISIBLES = 3;

/** Puntaje de 0 a 1 por categoría, tal como lo entrega OpenAI. */
type Puntajes = Record<string, number>;

/** Lo que dice la IA de un texto. Si no logra decir nada, `analyze` lanza un error. */
export type AnalysisVerdict =
  { ok: true; puntajes: Puntajes } | { ok: false; categorias: string[]; puntajes: Puntajes };

/**
 * Qué hacer con un mensaje antes de guardarlo:
 * - `publicar`: la IA lo aprobó (o no corresponde revisarlo).
 * - `rechazar`: la IA lo marcó; no se guarda.
 * - `revisar`: la IA no respondió; se guarda oculto hasta que un moderador lo apruebe.
 */
export type Decision = DecisionIa;

/** Respuesta de POST /v1/moderations, solo con lo que se usa. */
interface ModerationResponse {
  results?: {
    flagged?: unknown;
    categories?: Record<string, unknown>;
    category_scores?: Record<string, unknown>;
  }[];
}

/** Respuesta de POST /v1/decisions, solo con lo que se usa. */
interface DecisionsResponse {
  answers?: { type?: unknown; name?: unknown; probability?: unknown }[];
}

async function pedir(url: string, cfg: ModeracionIaConfig, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`OpenAI respondió ${res.status}`);
  return res.json() as Promise<unknown>;
}

/** Modo `moderation`: categorías fijas de OpenAI y su propio criterio de "marcado". */
async function analizarModeracion(
  text: string,
  cfg: ModeracionIaConfig,
  signal: AbortSignal,
): Promise<AnalysisVerdict> {
  const body = (await pedir(
    MODERATIONS_URL,
    cfg,
    { model: cfg.modelo, input: text },
    signal,
  )) as ModerationResponse;
  const result = body.results?.[0];
  // Una respuesta sin veredicto no es una aprobación: la decide un humano.
  if (!result || typeof result.flagged !== 'boolean') {
    throw new Error('Respuesta de OpenAI sin veredicto');
  }
  const puntajes: Puntajes = {};
  for (const [nombre, valor] of Object.entries(result.category_scores ?? {})) {
    if (typeof valor === 'number') puntajes[nombre] = valor;
  }
  if (!result.flagged) return { ok: true, puntajes };
  const categorias = Object.entries(result.categories ?? {})
    .filter(([, marcada]) => marcada === true)
    .map(([nombre]) => nombre);
  return { ok: false, categorias, puntajes };
}

/**
 * Modo `decision`: una pregunta de sí o no (predicado) por cada norma de `normas.ts`. Se
 * rechaza si alguna norma llega al umbral. Si OpenAI se niega a responder una pregunta o
 * falta alguna, no hay veredicto completo y el mensaje lo decide un humano.
 */
async function analizarDecision(
  text: string,
  cfg: ModeracionIaConfig,
  signal: AbortSignal,
): Promise<AnalysisVerdict> {
  const body = (await pedir(
    DECISIONS_URL,
    cfg,
    {
      model: cfg.modelo,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: CONTEXTO_PIZARRA }] },
        { role: 'user', content: [{ type: 'input_text', text }] },
      ],
      questions: NORMAS.map((n) => ({
        type: 'predicate',
        name: n.nombre,
        instructions: n.instrucciones,
      })),
    },
    signal,
  )) as DecisionsResponse;
  const respuestas = new Map((body.answers ?? []).map((a) => [a.name, a]));
  const puntajes: Puntajes = {};
  for (const { nombre } of NORMAS) {
    const r = respuestas.get(nombre);
    if (r?.type === 'refusal') throw new Error(`OpenAI no quiso evaluar la norma ${nombre}`);
    if (typeof r?.probability !== 'number') {
      throw new Error(`Respuesta de OpenAI sin la norma ${nombre}`);
    }
    puntajes[nombre] = r.probability;
  }
  const categorias = NORMAS.map((n) => n.nombre).filter((n) => puntajes[n]! >= cfg.umbral);
  return categorias.length === 0 ? { ok: true, puntajes } : { ok: false, categorias, puntajes };
}

/**
 * Cliente de OpenAI. Es un objeto y no una función suelta para que las pruebas puedan
 * reemplazar `analyze` sin salir a internet.
 */
export const analyzer = {
  analyze(text: string, cfg: ModeracionIaConfig, signal: AbortSignal): Promise<AnalysisVerdict> {
    return cfg.modo === 'decision'
      ? analizarDecision(text, cfg, signal)
      : analizarModeracion(text, cfg, signal);
  },
};

/**
 * Las últimas consultas a la IA, solo en memoria: sirven para mirar en vivo cómo está
 * decidiendo, se pierden al reiniciar y nunca guardan más de `capacidad` textos.
 */
export class BitacoraIa {
  private registros: RegistroIa[] = [];
  private totales: Record<DecisionIa, number> = { publicar: 0, rechazar: 0, revisar: 0 };
  private msTotal = 0;

  constructor(private readonly capacidad = 200) {}

  anotar(registro: RegistroIa): void {
    this.registros.unshift(registro);
    if (this.registros.length > this.capacidad) this.registros.length = this.capacidad;
    this.totales[registro.decision]++;
    this.msTotal += registro.ms;
  }

  resumen(cfg: ModeracionIaConfig | null): ResumenIa {
    const n = this.totales.publicar + this.totales.rechazar + this.totales.revisar;
    return {
      activa: cfg !== null,
      modo: cfg?.modo ?? null,
      modelo: cfg?.modelo ?? null,
      totales: { ...this.totales },
      msPromedio: n > 0 ? Math.round(this.msTotal / n) : null,
      registros: [...this.registros],
    };
  }
}

function principales(puntajes: Puntajes): RegistroIa['puntajes'] {
  return Object.entries(puntajes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, PUNTAJES_VISIBLES)
    .map(([categoria, puntaje]) => ({ categoria, puntaje }));
}

/**
 * Decide si un mensaje se publica, se rechaza o espera a un moderador. Se llama antes de
 * guardar nada: lo que la IA rechaza nunca llega a la base de datos ni a las pantallas.
 * Los avisos firmados por moderación no pasan por la IA.
 */
export async function decidirPublicacion(
  ctx: AppContext,
  text: string,
  autorModerador: string | null,
  autor: string,
): Promise<Decision> {
  const cfg = ctx.config.moderacionIa;
  if (!cfg || autorModerador !== null) return 'publicar';
  const inicio = performance.now();
  const anotar = (r: Pick<RegistroIa, 'decision' | 'categorias' | 'puntajes' | 'error'>) =>
    ctx.bitacoraIa.anotar({
      ...r,
      at: ctx.now(),
      ms: Math.round(performance.now() - inicio),
      autor,
      texto: text,
    });
  try {
    const v = await analyzer.analyze(text, cfg, AbortSignal.timeout(cfg.timeoutMs));
    const decision = v.ok ? 'publicar' : 'rechazar';
    anotar({
      decision,
      categorias: v.ok ? [] : v.categorias,
      puntajes: principales(v.puntajes),
      error: null,
    });
    return decision;
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    anotar({ decision: 'revisar', categorias: [], puntajes: [], error: motivo });
    // Sin el texto del mensaje en el registro: solo el motivo de la falla.
    console.warn(`[moderación IA] sin respuesta, el mensaje queda pendiente: ${motivo}`);
    return 'revisar';
  }
}
