import assert from 'node:assert/strict';
import { log as registrar } from 'node:console';
import proceso from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const carpeta = mkdtempSync(join(tmpdir(), 'pizarra-despliegue-'));
const archivo = join(carpeta, '.env');
const entorno = { ...proceso.env };
for (const variable of [
  'PUERTO_PUBLICADO',
  'MOD_USERS',
  'MOD_PASSWORD',
  'SESSION_SECRET',
  'TRUST_PROXY',
  'AUTO_HIDE_REPORTS',
]) {
  delete entorno[variable];
}

function configuracion(puerto, confianza) {
  writeFileSync(
    archivo,
    `MOD_USERS=Revision:CLAVE-FICTICIA-DE-VERIFICACION\n${confianza === undefined ? '' : `TRUST_PROXY=${confianza}\n`}${puerto === undefined ? '' : `PUERTO_PUBLICADO=${puerto}\n`}`,
    { mode: 0o600 },
  );
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        archivo,
        '--project-directory',
        raiz,
        '-f',
        join(raiz, 'docker-compose.yml'),
        'config',
        '--format',
        'json',
      ],
      { env: entorno, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
}

try {
  for (const [valor, esperado] of [
    [undefined, '3000'],
    ['3199', '3199'],
    ['', '3000'],
  ]) {
    const servicio = configuracion(valor, 'false').services.pizarra;
    assert.equal(servicio.ports.length, 1);
    assert.equal(servicio.ports[0].published, esperado);
    assert.equal(servicio.ports[0].target, 3000);
    assert.equal(servicio.ports[0].host_ip, '127.0.0.1');
    registrar(`Correcto: puerto publicado ${esperado}, interno 3000 y acceso solo por loopback.`);
  }
  assert.throws(() => configuracion('65536'));
  registrar('Correcto: se rechaza un puerto fuera del rango válido.');
  for (const [valor, esperado] of [
    [undefined, '1'],
    ['', '1'],
    ['false', 'false'],
    ['2', '2'],
  ]) {
    assert.equal(
      configuracion(undefined, valor).services.pizarra.environment.TRUST_PROXY,
      esperado,
    );
    registrar(`Correcto: confianza del proxy ${esperado}, sin publicar fuera de localhost.`);
  }
  registrar('Ocho comprobaciones de Compose aprobadas; no se levantaron contenedores.');
} finally {
  // Solo se elimina el archivo creado por esta comprobación y su carpeta temporal vacía.
  assert.equal(dirname(archivo), carpeta);
  unlinkSync(archivo);
  rmdirSync(carpeta);
}
