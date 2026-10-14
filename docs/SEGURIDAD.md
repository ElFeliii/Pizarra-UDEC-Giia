# Dependencias y revisión de seguridad

Las claves reales y los datos del evento no se incluyen en Git ni en la imagen. Mantener
`.env` y `data/` fuera del repositorio, usar las credenciales individuales por un canal privado
y conservar el historial saneado para publicar. Ver [PRIVACIDAD.md](PRIVACIDAD.md).

## Revisión ampliada del 14 de octubre de 2026

Se revisaron adicionalmente caché compartida, reconexiones dentro del mismo transporte,
reportes de objetivos no públicos, estadísticas de borrados, catálogo de temas y selectores
CSV. Correcciones y evidencia en [REVISION-SEGURIDAD-AMPLIADA.md](REVISION-SEGURIDAD-AMPLIADA.md).
La aceptación del proxy real y la invalidación de su caché previa corresponden a GIIA.

## Respuesta a la auditoría del 12 de octubre de 2026

La revisión cerrada el 14 de octubre incorpora las correcciones de aplicación descritas en
[RESPUESTA-AUDITORIA.md](RESPUESTA-AUDITORIA.md): arranque seguro por omisión,
firma fija de la maestra opcional como `Emergencia`, límites tempranos de eventos/conexiones
y lecturas HTTP, consulta indexada de avisos, protección de avisos auténticos frente al
autoocultado, comparación Unicode y visitas acotadas. También valida el origen de las acciones administrativas y corrige el borrado de datos
cuando existen visitas y otras dependencias. La migración **v6** se añade al final; no se
reescriben las migraciones publicadas. Hacer respaldo completo antes de actualizar.

Producción requiere credenciales válidas antes de escuchar. Desarrollo exige selección
explícita; no activar ese modo en el servidor del evento. Las claves individuales y la
maestra, si se utiliza, requieren un mínimo de 12 caracteres; generar valores aleatorios.
Una lista de moderadores mal formada o con identidades repetidas impide el arranque.
`MOD_PASSWORD` permanece vacía salvo necesidad aprobada y siempre se registra como
`Emergencia`, identidad reservada. Para revocar claves y sesiones, editar el `.env` protegido
y usar `docker compose up -d --force-recreate --wait --wait-timeout 120`; todas las sesiones
de moderación en memoria se invalidan. Un `restart` no importa variables nuevas.

Las notas y respuestas firmadas conservan filtros, secciones y revisión de reportes;
la excepción sólo impide su autoocultado por reportes. Copiar el nombre o la firma en JSON
no la concede. La comparación usa NFKC y dígitos Unicode decimales; el contenido almacenado
conserva NFC y la ñ. Las visitas nuevas se acotan en 300 por nota, conservando contadores
históricos superiores y crecimiento. No representan asistencia certificada ni antifraude.

El presupuesto temprano cuenta mensajes inválidos y desconocidos antes de SQLite.
Permite ráfagas legítimas de asistentes bajo el mismo WiFi y limita reconexiones por IP;
las lecturas HTTP caras devuelven 429 al agotarse. Estos controles no sustituyen la
protección de red/DDoS de GIIA. Sus capacidades y regresiones están en la respuesta técnica.

Compose usa `TRUST_PROXY=1` exclusivamente para un proxy local y backend publicado en
IPv4 loopback; adaptar con GIIA una cadena diferente. La configuración conserva origen,
IP y protocolo externos, con `Upgrade`/`Connection` y timeout de 75 segundos para WebSocket.
El cliente también admite HTTP long-polling; validar ambos transportes, cookies seguras,
reconexión y carga detrás del Nginx real. La aceptación institucional sigue pendiente.
Ver [DESPLIEGUE.md](DESPLIEGUE.md#3-proxy-con-websocket).

Los resultados de la versión nueva se registran con fecha en
[ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md). Los conteos y el escaneo del 8 y 9 de
octubre que se conservan más abajo son históricos y no certifican una imagen posterior.
La revisión local de módulos Unicode en Node 22.23.3 pasó; ese ensayo aislado no equivale
a verificar el nuevo servidor completo ni el host institucional.

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

## Controles de acceso revisados el 9 de octubre de 2026

Las nuevas regresiones comprueban la revocación inmediata de sesiones de moderación en
tiempo real, el origen de WebSocket y la visibilidad de notas, respuestas y metadatos.
El ranking público excluye contenido oculto y repara los contadores previos al arrancar.
Las consultas administrativas inválidas devuelven 400. Las claves individuales de producción
requieren un mínimo de 12 caracteres y se rechazan valores conocidos de desarrollo/ejemplo;
se recomienda generarlas con 24 bytes aleatorios, como explica [DESPLIEGUE.md](DESPLIEGUE.md).
Rotar las claves antiguas que no cumplan antes de actualizar, por un canal protegido.

Se conservaron la arquitectura y las migraciones publicadas. Las 33 pruebas adicionales
acompañan las correcciones. La suite completa tiene 394 casos y se ejecutó nuevamente;
evidencia y alcance en [ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md).

## Imagen final del 14 de octubre de 2026

Imagen `pizarra-udec:auditoria-20261014`, identificador `sha256:d3d9ca54bee9a79e7a5da827137f79e5b45caeaa97429c4dde82859b73046f68`.
Trivy 0.75.0, sin red: **228 avisos por paquete Debian, 99 identificadores distintos,
cero avisos Node y ninguna versión corregida indicada en la base consultada**.
Severidades por paquete: 83 bajas, 95 medias, 48 altas, una desconocida y una crítica.
La base se actualizó el 13 de octubre a las 19:11 UTC; el análisis final se realizó el 14.
El informe vigente es [seguridad-imagen.json](seguridad-imagen.json).

El aviso crítico sigue siendo CVE-2023-45853 de MiniZip. Se volvió a comprobar en esta
imagen que MiniZip no está instalado y se contrastó la nota de
[Debian sobre Bookworm](https://security-tracker.debian.org/tracker/CVE-2023-45853):
contrib/minizip no se construye dentro del paquete zlib de esa versión.
Esto acota la aplicabilidad de ese aviso; no descarta los otros ni reemplaza la decisión de GIIA.
No se presenta la imagen como libre de vulnerabilidades. El reporte anterior permanece
descrito más abajo como antecedente, con sus cifras y fechas originales.

La suite final, npm audit, Nginx y recuperación están documentados en
[ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md). El origen administrativo se comprueba
antes del cuerpo y autenticación, además del control de origen del tiempo real.

## Imagen de ejecución: referencia del 8 de octubre de 2026

Se construyó de nuevo con `docker build --pull --no-cache`. La etapa final aplica las actualizaciones
APT disponibles y retira npm, npx y Corepack después de instalar las dependencias de producción.
La aplicación sigue ejecutándose con Node 22, como usuario `node`, sin modo privilegiado.
Se confirmó que el servidor, SQLite, WebSocket, respaldo y reinicio funcionan sin instaladores.

El análisis con **Trivy 0.75.0 se ejecutó sin red**, contra un archivo de la imagen local.
La base de avisos se descargó antes, sin montar código ni la imagen en ese paso. El escaneo
posterior usó `--network none`, `--offline-scan` y `--skip-db-update`: no envió el contenido
a un servicio de análisis externo.

| Resultado                                    | Antes de la revisión | Imagen del 8 de octubre |
| -------------------------------------------- | -------------------: | ----------------------: |
| Avisos en paquetes Node detectados por Trivy |                   21 |                       0 |
| Avisos por paquete Debian                    |                  235 |                     222 |
| Avisos Debian con versión corregida indicada |                   13 |                       0 |

Los 13 avisos corregibles correspondían a `perl-base`, actualizado a `5.36.0-7+deb12u4`.
La retirada de npm y Corepack eliminó los avisos de sus dependencias de la imagen final.
La instalación de las dependencias de producción durante la construcción también informó
cero avisos npm; `npm audit --json` del proyecto terminó con salida 0 y cero vulnerabilidades.

**La imagen no se presenta como libre de vulnerabilidades.** El informe del 8 de octubre contiene 222
combinaciones de paquete y aviso, correspondientes a 93 identificadores distintos de Debian:
48 altas, 95 medias, 77 bajas, una de severidad desconocida y una clasificada como crítica.
La base consultada no indica versiones corregidas para esos paquetes en Debian 12.
El [informe estructurado fechado](seguridad-imagen.json) conserva identificadores, paquetes,
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
docker compose up -d --wait --wait-timeout 120
docker compose ps
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Respaldar primero y realizar esta operación en la ventana aprobada. El seguimiento de avisos
sin arreglo, la revisión del host y la autorización de producción pertenecen a la Célula.
