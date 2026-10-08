# Dependencias y revisión de seguridad

Las claves reales y los datos del evento no se incluyen en Git ni en la imagen. Mantener
`.env` y `data/` fuera del repositorio, usar las credenciales individuales por un canal privado
y conservar el historial saneado para publicar. Ver [PRIVACIDAD.md](PRIVACIDAD.md).

## Herramientas de desarrollo y construcción

Se actualizaron las siguientes dependencias transitivas. El archivo raíz `package.json`
fija `shell-quote` y `esbuild` mediante `overrides`, porque las herramientas todavía solicitan
versiones afectadas; `source-map-js` se actualizó en el lockfile:

- `concurrently` usa `shell-quote@1.11.0`: corrige el [aviso de inyección de comandos](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).
- Las herramientas usan `esbuild@0.28.2`, incluido el hijo de `tsup`: corrige el [aviso del servidor de desarrollo en Windows](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
- `source-map-js@1.2.2` queda registrado en `package-lock.json`: corrige el [aviso de denegación de servicio al procesar mapas de código](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

No se cambiaron los frameworks de la aplicación. La imagen final instala solo dependencias
de producción del servidor con `--omit=dev --ignore-scripts`; las herramientas anteriores
se usan durante desarrollo o construcción. Revisar tanto esas herramientas como producción:

```bash
npm ci --ignore-scripts
npm audit
npm audit --omit=dev
npm test
npm run typecheck
npm run lint
npm run build
npm run verificar:despliegue
```

Antes de retirar los `overrides`, confirmar que las herramientas superiores ya incorporan
versiones corregidas y repetir pruebas, compilación, Docker y revisión en navegador.
No usar `npm audit fix --force` como sustituto de esa revisión: puede cambiar versiones mayores.

## Prueba de credenciales y alcance

El detector de cadenas numéricas en la configuración tiene casos de prueba con muestras
ficticias, distintos delimitadores y números que no representan contraseñas. Complementa
la inspección del repositorio; no detecta cualquier secreto ni certifica un historial entero.

La revisión npm cubre los avisos conocidos de su registro en el momento de la consulta.
La Célula inspecciona también el sistema operativo de la imagen, el host, los accesos,
el proxy y las configuraciones reales antes de aprobar el levantamiento. Los permisos,
actualizaciones, monitoreo, logs y respaldos siguen el manual y la lista final de
[ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).

## Imagen de ejecución: revisión del 7 de octubre de 2026

Se construyó de nuevo con `docker build --pull`. La etapa final aplica las actualizaciones
APT disponibles y retira npm, npx y Corepack después de instalar las dependencias de producción.
La aplicación sigue ejecutándose con Node 22, como usuario `node`, sin modo privilegiado.
Se confirmó que el servidor, SQLite, WebSocket, respaldo y reinicio funcionan sin instaladores.

El análisis con **Trivy 0.75.0 se ejecutó sin red**, contra un archivo de la imagen local.
La base de avisos se descargó antes, sin montar código ni la imagen en ese paso. El escaneo
posterior usó `--network none`, `--offline-scan` y `--skip-db-update`: no envió el contenido
a un servicio de análisis externo.

| Resultado                                    | Imagen anterior | Imagen actual |
| -------------------------------------------- | --------------: | ------------: |
| Avisos en paquetes Node detectados por Trivy |              21 |             0 |
| Avisos por paquete Debian                    |             235 |           222 |
| Avisos Debian con versión corregida indicada |              13 |             0 |

Los 13 avisos corregibles correspondían a `perl-base`, actualizado a `5.36.0-7+deb12u4`.
La retirada de npm y Corepack eliminó los avisos de sus dependencias de la imagen final.
La instalación de las dependencias de producción durante la construcción también informó
cero avisos npm; `npm audit --json` del proyecto terminó con salida 0 y cero vulnerabilidades.

**La imagen no se presenta como libre de vulnerabilidades.** El informe final contiene 222
combinaciones de paquete y aviso, correspondientes a 93 identificadores distintos de Debian:
48 altas, 95 medias, 77 bajas, una de severidad desconocida y una clasificada como crítica.
La base consultada no indica versiones corregidas para esos paquetes en Debian 12.
El [informe estructurado](seguridad-imagen.json) conserva identificadores, paquetes,
versiones, estados y referencias para que la Célula evalúe aplicabilidad y tratamiento.

El aviso crítico `CVE-2023-45853` corresponde a MiniZip. La
[nota del equipo de seguridad de Debian](https://security-tracker.debian.org/tracker/CVE-2023-45853)
indica que en Bookworm el código afectado de `contrib/minizip` no se construye dentro de zlib;
se confirmó además que MiniZip no está instalado en el contenedor. Esa explicación permite
distinguir el aviso del escáner de la exposición del binario instalado, pero no descarta los
otros avisos ni sustituye la revisión de seguridad de GIIA.

Para revisar actualizaciones del sistema operativo, la Célula debe reconstruir sin reutilizar
la capa APT antigua, escanear y repetir las comprobaciones antes de activar la imagen:

```bash
docker compose build --pull --no-cache
docker compose up -d
docker compose ps
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Respaldar primero y realizar esta operación en la ventana aprobada. El seguimiento de avisos
sin arreglo, la revisión del host y la autorización de producción pertenecen a la Célula.
