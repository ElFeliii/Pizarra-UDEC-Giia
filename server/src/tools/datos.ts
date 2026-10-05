/**
 * Herramienta de datos para después del evento. Se ejecuta en el servidor, no desde el panel:
 * borrar es irreversible y las claves de los moderadores son cortas a propósito.
 *
 *   node server/dist/datos.js --resumen
 *   node server/dist/datos.js --anonimizar-ips
 *   node server/dist/datos.js --borrar-usuario 42
 *   node server/dist/datos.js --borrar-contenido
 *
 * Dentro del contenedor:
 *   docker compose exec pizarra node server/dist/datos.js --resumen
 *
 * Todo lo que borra pide `--si` para confirmar. Conviene respaldar antes (docs/DESPLIEGUE.md).
 */

import { openDatabase, type DB } from '../db/db';
import { loadConfig, loadDotEnv } from '../config';

export interface Resumen {
  usuarios: number;
  conIp: number;
  pines: number;
  pinesOcultos: number;
  respuestas: number;
  respuestasOcultas: number;
  reportes: number;
  primero: number | null;
  ultimo: number | null;
}

const uno = <T>(db: DB, sql: string, ...args: unknown[]): T => db.prepare(sql).get(...args) as T;

export function resumen(db: DB): Resumen {
  const n = (sql: string) => uno<{ n: number }>(db, sql).n;
  const rango = uno<{ primero: number | null; ultimo: number | null }>(
    db,
    'SELECT MIN(created_at) AS primero, MAX(created_at) AS ultimo FROM pins',
  );
  return {
    usuarios: n('SELECT COUNT(*) AS n FROM users'),
    conIp: n("SELECT COUNT(*) AS n FROM users WHERE ip IS NOT NULL AND ip <> ''"),
    pines: n('SELECT COUNT(*) AS n FROM pins'),
    pinesOcultos: n('SELECT COUNT(*) AS n FROM pins WHERE hidden_at IS NOT NULL'),
    respuestas: n('SELECT COUNT(*) AS n FROM replies'),
    respuestasOcultas: n('SELECT COUNT(*) AS n FROM replies WHERE hidden_at IS NOT NULL'),
    reportes: n('SELECT COUNT(*) AS n FROM reports'),
    primero: rango.primero,
    ultimo: rango.ultimo,
  };
}

/**
 * Borra las IP guardadas. Es lo primero que conviene hacer al terminar el evento: la IP solo
 * sirve para el anti-spam mientras la pizarra está abierta, y los mensajes se conservan igual.
 */
export function anonimizarIps(db: DB): number {
  const r = db.prepare("UPDATE users SET ip = NULL WHERE ip IS NOT NULL AND ip <> ''").run();
  return r.changes;
}

/** Busca usuarios por id exacto o por nombre (sin distinguir mayúsculas). */
export function buscarUsuarios(db: DB, aguja: string): { id: number; name: string }[] {
  const porId = Number(aguja);
  if (Number.isInteger(porId) && porId > 0) {
    const u = uno<{ id: number; name: string } | undefined>(
      db,
      'SELECT id, name FROM users WHERE id = ?',
      porId,
    );
    return u ? [u] : [];
  }
  return db
    .prepare('SELECT id, name FROM users WHERE name = ? COLLATE NOCASE ORDER BY id')
    .all(aguja) as { id: number; name: string }[];
}

export interface Borrado {
  pines: number;
  respuestas: number;
  usuarios: number;
}

/**
 * Borra de verdad todo lo de un usuario: sus respuestas, sus pines (con las respuestas que
 * otros dejaron ahí) y su fila. Es lo que corresponde si alguien pide que lo saquen.
 */
export function borrarUsuario(db: DB, id: number): Borrado {
  return db.transaction(() => {
    const pines = db.prepare('SELECT id FROM pins WHERE user_id = ?').all(id) as { id: number }[];
    let respuestas = 0;
    for (const pin of pines) {
      respuestas += db.prepare('DELETE FROM replies WHERE pin_id = ?').run(pin.id).changes;
      db.prepare('DELETE FROM content_fts WHERE pin_id = ?').run(pin.id);
      db.prepare("DELETE FROM reports WHERE target_type = 'pin' AND target_id = ?").run(pin.id);
    }
    respuestas += db.prepare('DELETE FROM replies WHERE user_id = ?').run(id).changes;
    db.prepare(
      "DELETE FROM content_fts WHERE kind = 'reply' AND ref_id IN (SELECT id FROM replies WHERE user_id = ?)",
    ).run(id);
    const borradosPines = db.prepare('DELETE FROM pins WHERE user_id = ?').run(id).changes;
    db.prepare('DELETE FROM reports WHERE user_id = ?').run(id);
    const usuarios = db.prepare('DELETE FROM users WHERE id = ?').run(id).changes;
    return { pines: borradosPines, respuestas, usuarios };
  })();
}

/** Vacía el contenido y los asistentes, y deja la lista de palabras y el registro de moderación. */
export function borrarContenido(db: DB): Borrado {
  return db.transaction(() => {
    const respuestas = db.prepare('DELETE FROM replies').run().changes;
    const pines = db.prepare('DELETE FROM pins').run().changes;
    db.prepare('DELETE FROM reports').run();
    db.prepare('DELETE FROM content_fts').run();
    db.prepare('DELETE FROM word_counts').run();
    const usuarios = db.prepare('DELETE FROM users').run().changes;
    return { pines, respuestas, usuarios };
  })();
}

// ---------------------------------------------------------------------------
// Línea de comandos

const fecha = (t: number | null): string =>
  t === null ? '—' : new Date(t).toLocaleString('es-CL', { timeZone: 'America/Santiago' });

function imprimirResumen(db: DB): void {
  const r = resumen(db);
  console.log(`Asistentes:   ${r.usuarios} (${r.conIp} con IP guardada)`);
  console.log(`Pines:        ${r.pines} (${r.pinesOcultos} ocultos)`);
  console.log(`Respuestas:   ${r.respuestas} (${r.respuestasOcultas} ocultas)`);
  console.log(`Reportes:     ${r.reportes}`);
  console.log(`Actividad:    ${fecha(r.primero)}  →  ${fecha(r.ultimo)}`);
}

const AYUDA = `Herramienta de datos de Pizarra UdeC

  --resumen                  Cuánto hay guardado (no toca nada).
  --anonimizar-ips           Borra las IP de los asistentes. Conserva los mensajes.
  --borrar-usuario <id|nombre>  Borra a esa persona y todo lo que publicó.
  --borrar-contenido         Borra pines, respuestas, reportes y asistentes.
  --si                       Confirma la operación (sin esto solo se muestra qué haría).
  --db <ruta>                Base de datos a usar (por defecto, la de la configuración).
`;

function valor(bandera: string): string | undefined {
  const i = process.argv.indexOf(bandera);
  return i === -1 ? undefined : process.argv[i + 1];
}

export async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--ayuda') || args.includes('-h')) {
    console.log(AYUDA);
    return 0;
  }

  loadDotEnv();
  const ruta = valor('--db') ?? loadConfig().dbPath;
  const confirmado = args.includes('--si');
  const db = openDatabase(ruta);
  console.log(`Base de datos: ${ruta}\n`);

  try {
    if (args.includes('--resumen')) {
      imprimirResumen(db);
      return 0;
    }

    if (args.includes('--anonimizar-ips')) {
      const cuantas = resumen(db).conIp;
      if (!confirmado) {
        console.log(`Se borrarían ${cuantas} direcciones IP. Agrega --si para hacerlo.`);
        return 0;
      }
      console.log(`IP borradas: ${anonimizarIps(db)}`);
      return 0;
    }

    const aguja = valor('--borrar-usuario');
    if (args.includes('--borrar-usuario')) {
      if (!aguja) {
        console.error('Falta el id o el nombre: --borrar-usuario 42');
        return 1;
      }
      const encontrados = buscarUsuarios(db, aguja);
      if (encontrados.length === 0) {
        console.error(`No hay ningún asistente que calce con "${aguja}".`);
        return 1;
      }
      if (encontrados.length > 1) {
        console.error(`Hay ${encontrados.length} asistentes con ese nombre. Usa el id:`);
        for (const u of encontrados) console.error(`  ${u.id}  ${u.name}`);
        return 1;
      }
      const usuario = encontrados[0]!;
      if (!confirmado) {
        console.log(`Se borraría a ${usuario.name} (id ${usuario.id}) y todo lo que publicó.`);
        console.log('Agrega --si para hacerlo. Respalda antes: es irreversible.');
        return 0;
      }
      const b = borrarUsuario(db, usuario.id);
      console.log(`Borrado ${usuario.name}: ${b.pines} pines, ${b.respuestas} respuestas.`);
      return 0;
    }

    if (args.includes('--borrar-contenido')) {
      if (!confirmado) {
        imprimirResumen(db);
        console.log('\nSe borraría TODO lo anterior. Agrega --si para hacerlo.');
        return 0;
      }
      const b = borrarContenido(db);
      console.log(
        `Borrados ${b.pines} pines, ${b.respuestas} respuestas y ${b.usuarios} asistentes.`,
      );
      return 0;
    }

    console.error(`No entendí los argumentos.\n\n${AYUDA}`);
    return 1;
  } finally {
    db.close();
  }
}

// Solo corre como programa; al importarlo desde las pruebas no hace nada.
if (process.argv[1]?.includes('datos')) {
  process.exit(await main());
}
