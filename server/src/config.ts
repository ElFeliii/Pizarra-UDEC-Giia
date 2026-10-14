import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Carpeta del paquete server (funciona igual desde src/ en desarrollo y desde dist/ compilado). */
export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..');

const DEV_MOD_PASSWORD = 'moderador-dev';
const DEV_SECRET = 'solo-para-desarrollo-cambiar-en-produccion';
export const NOMBRE_EMERGENCIA = 'Emergencia';

/** Configuración y login deben resolver la misma identidad para impedir nombres ambiguos. */
export function normalizarNombreModerador(nombre: string): string {
  return nombre.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  HOST: z.string().optional(),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DB_PATH: z.string().default(resolve(REPO_ROOT, 'data/pizarra.db')),
  INSTITUTIONS_PATH: z.string().default(resolve(SERVER_ROOT, 'data/instituciones.json')),
  SECCIONES_PATH: z.string().default(resolve(SERVER_ROOT, 'data/secciones.json')),
  CARRERAS_PATH: z.string().default(resolve(SERVER_ROOT, 'data/carreras.json')),
  FAQ_PATH: z.string().default(resolve(SERVER_ROOT, 'data/faq.json')),
  CLIENT_DIST: z.string().default(resolve(REPO_ROOT, 'client/dist')),
  MOD_PASSWORD: z.string().optional(),
  /** Lista "nombre:clave,nombre:clave". Cada moderador entra con la suya. */
  MOD_USERS: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  /**
   * "false", "true", "loopback", un número de saltos de proxy, o una lista de IPs/CIDR.
   * Por omisión confía en un proxy que corra en el mismo servidor, que es como se despliega:
   * así se lee la IP real de cada asistente sin tener que configurar nada.
   */
  TRUST_PROXY: z.string().default('loopback'),
  AUTO_HIDE_REPORTS: z.coerce.number().int().min(0).default(3),
});

/** Un moderador con su propia clave. El nombre es el que queda en el registro de acciones. */
export interface Moderator {
  name: string;
  password: string;
}

export interface Config {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  dbPath: string;
  institutionsPath: string;
  seccionesPath: string;
  carrerasPath: string;
  faqPath: string;
  clientDist: string;
  /** Clave opcional de emergencia, siempre atribuida a la identidad reservada. */
  modPassword: string;
  moderators: Moderator[];
  sessionSecret: string;
  trustProxy: boolean | number | string;
  /** 0 = desactivado. */
  autoHideReports: number;
}

/**
 * En desarrollo solo escucha en el propio computador; así nadie más en el WiFi entra sin
 * querer. Con `--lan` (npm run dev:lan) se abre a la red local para probar en el celular.
 * En producción escucha en todas las interfaces: dentro de Docker es lo que corresponde.
 */
function defaultHost(env: 'development' | 'production' | 'test', argumentos: string[]): string {
  if (env === 'production') return '0.0.0.0';
  return argumentos.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
}

/**
 * `--port 3000` manda sobre la variable PORT. Sirve cuando quien lanza el proceso define PORT
 * para otra cosa (un lanzador de vista previa, por ejemplo) y se llevaría el servidor de API.
 */
function argvPort(argumentos: string[]): number | undefined {
  const i = argumentos.indexOf('--port');
  if (i === -1) return undefined;
  const n = Number(argumentos[i + 1]);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : undefined;
}

/**
 * Moderadores de desarrollo. En producción no se usan nunca: ahí las credenciales llegan por
 * MOD_USERS y no existen dentro del código, para que el repositorio se pueda publicar sin
 * regalarle a nadie el acceso al panel.
 */
export function devModerators(): Moderator[] {
  return Array.from({ length: 3 }, (_, i) => ({
    name: `Moderador ${i + 1}`,
    password: DEV_MOD_PASSWORD,
  }));
}

/** "ana:clave1,juan:clave2" → lista de moderadores. Ignora lo que venga mal escrito. */
export function parseModerators(raw: string | undefined): Moderator[] {
  if (!raw) return [];
  const out: Moderator[] = [];
  const vistos = new Set<string>();
  for (const parte of raw.split(',')) {
    const i = parte.indexOf(':');
    if (i <= 0) continue;
    const name = parte.slice(0, i).trim();
    const password = parte.slice(i + 1).trim();
    const clave = normalizarNombreModerador(name);
    if (!name || !password || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ name, password });
  }
  return out;
}

const SECRET_FILE = 'session-secret';

/**
 * Secreto que firma las cookies de moderador. Si no viene por variable de entorno, se genera
 * uno y se guarda junto a la base de datos: así el despliegue no exige preparar nada a mano y
 * el secreto sobrevive a un reinicio; los moderadores deben iniciar sesión nuevamente.
 */
function resolveSessionSecret(
  explicito: string | undefined,
  prod: boolean,
  dbPath: string,
): string {
  if (explicito) {
    if (prod && explicito.length < 32) {
      throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
    }
    return explicito;
  }
  if (!prod) return DEV_SECRET;
  if (dbPath === ':memory:') return randomBytes(48).toString('base64url');

  const carpeta = dirname(resolve(dbPath));
  const archivo = join(carpeta, SECRET_FILE);
  if (existsSync(archivo)) {
    const guardado = readFileSync(archivo, 'utf8').trim();
    if (guardado.length >= 32) return guardado;
  }
  const nuevo = randomBytes(48).toString('base64url');
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    archivo,
    `${nuevo}
`,
    'utf8',
  );
  try {
    chmodSync(archivo, 0o600);
  } catch {
    // En Windows y en algunos volúmenes montados no se pueden fijar permisos: no es crítico.
  }
  return nuevo;
}

function parseTrustProxy(v: string): boolean | number | string {
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

/** Carga .env (si existe) desde la carpeta actual o la raíz del repo, sin pisar variables ya definidas. */
export function loadDotEnv(): void {
  for (const file of [resolve(process.cwd(), '.env'), resolve(REPO_ROOT, '.env')]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
  }
}

/** Evita perder moderadores por errores de formato o por nombres que el login trata como iguales. */
function validarModeradores(raw: string | undefined): void {
  if (!raw) return;
  const vistos = new Set<string>();
  for (const parte of raw.split(',')) {
    const separador = parte.indexOf(':');
    const nombre = separador > 0 ? parte.slice(0, separador).trim() : '';
    const clave = separador > 0 ? parte.slice(separador + 1).trim() : '';
    if (!nombre || !clave) {
      throw new Error('MOD_USERS debe contener pares nombre:clave separados por comas.');
    }
    const identidad = normalizarNombreModerador(nombre);
    if (identidad === normalizarNombreModerador(NOMBRE_EMERGENCIA)) {
      throw new Error('El nombre Emergencia está reservado para MOD_PASSWORD.');
    }
    if (vistos.has(identidad)) {
      throw new Error(
        'MOD_USERS contiene un nombre de moderador repetido después de normalizarlo.',
      );
    }
    vistos.add(identidad);
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argumentos: string[] = process.argv,
): Config {
  const desarrollo = argumentos.includes('--desarrollo');
  if (desarrollo && env.NODE_ENV && env.NODE_ENV !== 'development') {
    throw new Error('--desarrollo es incompatible con un NODE_ENV distinto de development.');
  }
  const e = envSchema.parse({
    ...env,
    NODE_ENV: env.NODE_ENV ?? (desarrollo ? 'development' : undefined),
  });
  const prod = e.NODE_ENV === 'production';

  validarModeradores(e.MOD_USERS);
  const moderators = e.MOD_USERS ? parseModerators(e.MOD_USERS) : prod ? [] : devModerators();
  const maestra = e.MOD_PASSWORD ?? '';
  const esMarcador = (clave: string) =>
    clave === DEV_MOD_PASSWORD || clave === 'REEMPLAZAR-CON-CLAVE-DEL-EQUIPO';

  if (esMarcador(maestra)) {
    throw new Error('MOD_PASSWORD no puede ser una clave de desarrollo o de ejemplo.');
  }
  if (maestra.length > 0 && maestra.length < 12) {
    throw new Error('MOD_PASSWORD debe tener al menos 12 caracteres.');
  }
  if (
    prod &&
    moderators.some((moderador) => moderador.password.length < 12 || esMarcador(moderador.password))
  ) {
    throw new Error(
      'Cada clave de MOD_USERS debe tener al menos 12 caracteres y no ser una clave de desarrollo o de ejemplo.',
    );
  }
  if (prod && maestra.length === 0 && moderators.length === 0) {
    throw new Error(
      'Falta definir quién modera. Crea un archivo .env junto a docker-compose.yml con:\n' +
        '  MOD_USERS=Moderador 1:clave-privada-del-equipo,Moderador 2:otra-clave-privada\n' +
        'Cada clave debe tener al menos 12 caracteres. MOD_PASSWORD es opcional y se registra como Emergencia.',
    );
  }
  return {
    env: e.NODE_ENV,
    host: e.HOST || defaultHost(e.NODE_ENV, argumentos),
    port: argvPort(argumentos) ?? e.PORT,
    dbPath: e.DB_PATH,
    institutionsPath: e.INSTITUTIONS_PATH,
    seccionesPath: e.SECCIONES_PATH,
    carrerasPath: e.CARRERAS_PATH,
    faqPath: e.FAQ_PATH,
    clientDist: e.CLIENT_DIST,
    modPassword: maestra,
    moderators,
    sessionSecret: resolveSessionSecret(e.SESSION_SECRET, prod, e.DB_PATH),
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    autoHideReports: e.AUTO_HIDE_REPORTS,
  };
}
