import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NOMBRE_EMERGENCIA, normalizarNombreModerador, type Moderator } from '../config';

export const MOD_COOKIE = 'pz_mod';

/** Clave que nunca calza: se compara contra ella cuando el nombre no existe. */
const SIN_MODERADOR = 'no-existe-este-moderador';
export const MOD_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Comparación en tiempo constante (se comparan hashes para igualar largos). */
export function checkPassword(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Autentica a un moderador. Devuelve el nombre tal como está escrito en la lista (así el
 * registro de acciones queda parejo) o null.
 *
 * La clave maestra, si existe, registra siempre Emergencia para impedir atribuir acciones
 * a otro moderador. Siempre se compara algo, para no delatar por el
 * tiempo de respuesta si el nombre existe o no.
 */
export function authenticateModerator(
  moderators: Moderator[],
  masterPassword: string,
  name: string,
  password: string,
): string | null {
  const buscado = normalizarNombreModerador(name);
  const mod = moderators.find((m) => normalizarNombreModerador(m.name) === buscado);
  const esperado = mod?.password ?? SIN_MODERADOR;
  const propia = checkPassword(password, esperado);
  const maestra = masterPassword.length > 0 && checkPassword(password, masterPassword);
  if (maestra) return NOMBRE_EMERGENCIA;
  if (mod && propia) return mod.name;
  return null;
}

interface ModSession {
  name: string;
  expires: number;
}

/**
 * Sesiones de moderador en memoria. Reiniciar el servidor cierra las sesiones, lo que es
 * aceptable para un evento (el moderador vuelve a entrar).
 */
export class ModSessions {
  private readonly sessions = new Map<string, ModSession>();

  constructor(private readonly now: () => number = Date.now) {}

  create(name: string): string {
    const sid = randomBytes(24).toString('base64url');
    this.sessions.set(sid, { name, expires: this.now() + MOD_SESSION_TTL_MS });
    return sid;
  }

  get(sid: string | undefined | null): string | undefined {
    if (!sid) return undefined;
    const s = this.sessions.get(sid);
    if (!s) return undefined;
    if (s.expires < this.now()) {
      this.sessions.delete(sid);
      return undefined;
    }
    return s.name;
  }

  destroy(sid: string | undefined | null): void {
    if (sid) this.sessions.delete(sid);
  }

  sweep(): void {
    const t = this.now();
    for (const [sid, s] of this.sessions) if (s.expires < t) this.sessions.delete(sid);
  }
}
