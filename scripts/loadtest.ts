/**
 * Prueba de carga: N lectores conectados + M escritores que publican pines.
 * Mide cuánto tarda cada pin en llegar a todos los lectores (latencia de difusión).
 *
 *   URL=http://localhost:3000 READERS=800 WRITERS=20 npm run loadtest
 *
 * Nota: los límites por IP del servidor aplican (todo sale de esta máquina), así que cada
 * escritor publica 2 pines (la ráfaga permitida). Los lectores no necesitan sesión.
 */
import type { ClientToServerEvents, PinSummary, ServerToClientEvents } from '@pizarra/shared';
import { io, type Socket } from 'socket.io-client';

type S = Socket<ServerToClientEvents, ClientToServerEvents>;

const URL = process.env.URL ?? 'http://localhost:3000';
const READERS = Number(process.env.READERS ?? 500);
const WRITERS = Number(process.env.WRITERS ?? 20);
const PINS_PER_WRITER = 2;
const CONNECT_BATCH = 50;

function connect(token?: string): Promise<S> {
  return new Promise((resolve, reject) => {
    const s: S = io(URL, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
    });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

/** La primera institución que ofrezca el servidor: la lista real cambia, no se puede fijar. */
let institucion: string | undefined;

async function institutionId(): Promise<string> {
  if (institucion) return institucion;
  const res = await fetch(`${URL}/api/institutions`);
  if (!res.ok) throw new Error(`no se pudo leer la lista de instituciones: ${res.status}`);
  const lista = (await res.json()) as { id: string }[];
  const primera = lista.find((i) => i.id !== 'otra');
  if (!primera) throw new Error('el servidor no tiene instituciones cargadas');
  institucion = primera.id;
  return institucion;
}

async function session(i: number): Promise<string> {
  const res = await fetch(`${URL}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Carga ${i}`, institutionId: await institutionId() }),
  });
  if (!res.ok) throw new Error(`sesión ${i}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { token: string }).token;
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;
}

async function main() {
  console.log(`Conectando ${READERS} lectores a ${URL}…`);
  const t0 = performance.now();
  const readers: S[] = [];
  for (let i = 0; i < READERS; i += CONNECT_BATCH) {
    const batch = Array.from({ length: Math.min(CONNECT_BATCH, READERS - i) }, () => connect());
    readers.push(...(await Promise.all(batch)));
  }
  console.log(
    `  ${readers.length} conectados en ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );

  // Momento de envío por texto (el evento puede llegar antes que el ack, así que no se usa el id).
  const sentAt = new Map<string, number>();
  const latencies: number[] = [];
  for (const r of readers) {
    r.on('pin:created', (pin: PinSummary) => {
      const start = sentAt.get(pin.preview);
      if (start !== undefined) latencies.push(performance.now() - start);
    });
  }

  console.log(`Creando ${WRITERS} escritores…`);
  const writers = await Promise.all(
    Array.from({ length: WRITERS }, async (_, i) => connect(await session(i))),
  );

  console.log(`Publicando ${WRITERS * PINS_PER_WRITER} pines…`);
  let rejected = 0;
  await Promise.all(
    writers.map(async (w, i) => {
      for (let k = 0; k < PINS_PER_WRITER; k++) {
        // Sin números largos: el filtro de datos personales los bloquea (parecen teléfonos o RUT).
        const text = `Pin de carga ${i}-${k} ${Math.random().toString(36).slice(2, 7)}`;
        sentAt.set(text, performance.now());
        const res = await w.emitWithAck('pin:create', {
          surface: 'board',
          x: 500 + Math.random() * 7000,
          y: 500 + Math.random() * 7000,
          color: 'azul',
          text,
        });
        if (!res.ok) {
          rejected++;
          if (rejected === 1)
            console.log(`  primer rechazo: ${res.error.code} (${res.error.message})`);
        }
        await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));
      }
    }),
  );

  await new Promise((r) => setTimeout(r, 2000));

  const sorted = latencies.sort((a, b) => a - b);
  const expected = (WRITERS * PINS_PER_WRITER - rejected) * READERS;
  console.log('\nResultados');
  console.log(
    `  entregas: ${sorted.length} de ${expected} esperadas (${rejected} pines rechazados)`,
  );
  console.log(`  latencia p50: ${pct(sorted, 50).toFixed(0)} ms`);
  console.log(`  latencia p95: ${pct(sorted, 95).toFixed(0)} ms`);
  console.log(`  latencia p99: ${pct(sorted, 99).toFixed(0)} ms`);
  console.log(`  latencia máx: ${(sorted[sorted.length - 1] ?? NaN).toFixed(0)} ms`);

  for (const s of [...readers, ...writers]) s.disconnect();
  process.exit(sorted.length >= expected ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
