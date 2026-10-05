export interface BucketSpec {
  /** Máximo de acciones seguidas (ráfaga). */
  capacity: number;
  /** Cada cuántos ms se recupera una acción. */
  refillMs: number;
}

export interface TakeResult {
  ok: boolean;
  /** Si !ok, cuántos ms faltan para la próxima acción. */
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  last: number;
}

/** Token bucket en memoria, por clave (sesión, IP, etc.). */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly spec: BucketSpec,
    private readonly now: () => number = Date.now,
  ) {}

  private refill(key: string): Bucket {
    const t = this.now();
    const b = this.buckets.get(key);
    if (!b) {
      const fresh = { tokens: this.spec.capacity, last: t };
      this.buckets.set(key, fresh);
      return fresh;
    }
    const gained = (t - b.last) / this.spec.refillMs;
    if (gained > 0) {
      b.tokens = Math.min(this.spec.capacity, b.tokens + gained);
      b.last = t;
    }
    return b;
  }

  take(key: string): TakeResult {
    const b = this.refill(key);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true, retryAfterMs: 0 };
    }
    return { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) * this.spec.refillMs) };
  }

  /** Elimina buckets llenos (inactivos) para no acumular memoria. */
  sweep(): void {
    for (const key of this.buckets.keys()) {
      if (this.refill(key).tokens >= this.spec.capacity) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

/**
 * Límite combinado sesión + IP. Los límites por IP son generosos porque en el evento
 * muchos asistentes comparten el WiFi (misma IP pública).
 */
export class DualLimiter {
  readonly perKey: RateLimiter;
  readonly perIp: RateLimiter;

  constructor(keySpec: BucketSpec, ipSpec: BucketSpec, now?: () => number) {
    this.perKey = new RateLimiter(keySpec, now);
    this.perIp = new RateLimiter(ipSpec, now);
  }

  take(key: string, ip: string): TakeResult {
    const a = this.perKey.take(key);
    if (!a.ok) return a;
    return this.perIp.take(ip);
  }

  sweep(): void {
    this.perKey.sweep();
    this.perIp.sweep();
  }
}

const SEC = 1000;
const MIN = 60 * SEC;

/** Límites acordados en el diseño (docs/diseno.md). */
export const LIMIT_SPECS = {
  pin: { key: { capacity: 2, refillMs: 30 * SEC }, ip: { capacity: 40, refillMs: 1.5 * SEC } },
  reply: { key: { capacity: 3, refillMs: 5 * SEC }, ip: { capacity: 60, refillMs: 0.25 * SEC } },
  report: { key: { capacity: 10, refillMs: MIN }, ip: { capacity: 200, refillMs: 3 * SEC } },
  /** Intentos rechazados por el filtro: frena a quien prueba variantes para evadirlo. */
  rejected: { capacity: 6, refillMs: 10 * SEC },
  /** Creación de sesiones: solo por IP (aún no hay sesión). Generoso por el NAT del WiFi. */
  session: { capacity: 60, refillMs: SEC },
  /**
   * Avisos de "abrí esta nota". Muy generoso a propósito: en el evento varios cientos de
   * personas comparten una sola IP y cada una abre notas todo el rato. No es un control de
   * fraude —de eso se encarga la unicidad por persona y nota— sino un freno ante una avalancha.
   */
  vista: { capacity: 600, refillMs: 100 },
  /**
   * Login de moderador. Las claves del evento son cortas, así que el freno importa: 5 intentos
   * seguidos y después uno por minuto desde esa IP.
   */
  modLogin: { capacity: 5, refillMs: 60 * SEC },
} as const;

export function createLimiters(now?: () => number) {
  return {
    pin: new DualLimiter(LIMIT_SPECS.pin.key, LIMIT_SPECS.pin.ip, now),
    reply: new DualLimiter(LIMIT_SPECS.reply.key, LIMIT_SPECS.reply.ip, now),
    report: new DualLimiter(LIMIT_SPECS.report.key, LIMIT_SPECS.report.ip, now),
    rejected: new RateLimiter(LIMIT_SPECS.rejected, now),
    session: new RateLimiter(LIMIT_SPECS.session, now),
    vista: new RateLimiter(LIMIT_SPECS.vista, now),
    modLogin: new RateLimiter(LIMIT_SPECS.modLogin, now),
  };
}
export type Limiters = ReturnType<typeof createLimiters>;
