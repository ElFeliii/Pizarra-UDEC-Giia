# Guía para informática: Pizarra UdeC

Actualización del documento: **14 de octubre de 2026**. La evidencia previa corresponde
al **8 y 9 de octubre de 2026**; consultar el informe fechado de verificación para los
resultados de cada versión. La aceptación del proxy institucional sigue pendiente.
Guía principal para la Célula de Infraestructura y Seguridad de GIIA, según su Manual de
Trabajo 1.0 del 15 de junio de 2026. El despliegue institucional todavía requiere aprobación.

La revisión ampliada de esta entrega está en
[REVISION-SEGURIDAD-AMPLIADA.md](REVISION-SEGURIDAD-AMPLIADA.md). Incluye protección de
caché, reconexión, reportes, borrados, catálogo y CSV; su evidencia está fechada por versión.

## 1. Proyecto, repositorio y código

Pizarra UdeC permite participar en un evento de puertas abiertas de la Universidad de
Concepción: notas compartidas, pines en el mapa, consejos, historias, carreras y preguntas
frecuentes. Incluye respuestas, búsqueda, filtro de groserías, reportes y moderación en tiempo real.

Repositorio: [ElFeliii/Pizarra-UDEC-Giia](https://github.com/ElFeliii/Pizarra-UDEC-Giia).
Comprobar acceso antes de instalar; si requiere autorización, habilitar las cuentas
personales del equipo que despliega y de la Célula. La visibilidad no sustituye la
protección de credenciales y datos, que siempre se entregan por separado. Instalar únicamente
el historial saneado publicado; el historial original de desarrollo conserva información
privada y no pertenece a la entrega.

Un contenedor sirve página, API, WebSocket y panel. Servidor Node 22/Fastify 5/Socket.IO 4,
cliente React/Vite y base SQLite con WAL. El contenedor ejecuta como usuario `node`,
UID/GID 1000; los datos persisten en `data/`. No necesita otro servicio de base de datos.

| Ruta del repositorio                               | Función                                                         |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `shared/src/`                                      | Tipos, eventos y validaciones compartidos                       |
| `server/src/`                                      | API, autenticación, moderación, tiempo real y servicios         |
| `server/src/db/schema.ts`                          | Migraciones; se aplican al iniciar                              |
| `client/src/`                                      | Interfaz, pizarra, mapa, muros y panel                          |
| `client/src/map/`                                  | Geometría, fichas y descripciones de edificios                  |
| `client/public/edificios/`                         | Fotografías libres servidas por la aplicación                   |
| `server/data/`                                     | Catálogos versionados: instituciones, secciones, carreras y FAQ |
| `server/test/` y `scripts/`                        | Pruebas, carga y generadores                                    |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | Construcción y configuración de producción                      |
| `docs/`                                            | Instrucciones operativas e informes                             |

## 2. URL, puertos y requisitos

**No existe todavía un dominio asignado.** La dirección será
`https://<subdominio-asignado>.giia.udec.cl`; el nombre del repositorio no es el dominio.
`pizarra.giia.udec.cl` aparece en otros documentos únicamente como propuesta.

| Dirección o puerto             | Uso                                                               |
| ------------------------------ | ----------------------------------------------------------------- |
| URL pública asignada, 443/TCP  | HTTPS: página, API, WebSocket y `/moderador`                      |
| 80/TCP, opcional               | Redirección/certificados del proxy, según GIIA                    |
| `127.0.0.1:<PUERTO_PUBLICADO>` | Backend en el anfitrión; configurable en `.env`, 3000 por defecto |
| 3000/TCP interno               | Proceso dentro del contenedor; permanece fijo                     |
| 5173/TCP                       | Desarrollo local con Vite; no se usa en producción                |
| `/api/health`                  | Comprobación de salud                                             |

El proxy HTTPS previsto corre en el mismo anfitrión. Si está en otra máquina, la Célula
acuerda interfaz privada, firewall y confianza del proxy antes de cambiar la exposición.
No publicar directamente el backend en internet.

Solicitar el levantamiento por el **ticket oficial**: objetivo, responsable, fechas,
repositorio, documentos, subdominio y recursos. Propuesta inicial: 1 vCPU, 1 GB RAM y
2 GB de disco para aplicación/imagen; añadir espacio de construcción, logs y respaldos.
La medición local no garantiza capacidad del servidor real. La Célula aprueba recursos,
cuentas SSH/Docker y prepara `/var/src/pizarra-udec`. Se necesitan Docker y Compose con
soporte de `--wait`; Node/npm en el anfitrión no son necesarios para producción.

La construcción descarga la imagen base, actualizaciones Debian y paquetes npm. En un
servidor aislado, importar una imagen compatible y usar `--no-build`, siguiendo
[DESPLIEGUE, sección 9](DESPLIEGUE.md#9-si-el-servidor-no-tiene-salida-a-internet).
También debe existir acceso Git autorizado o un mirror del repositorio saneado.

## 3. Primera instalación en Linux

Ejecutar después de la aprobación, con cuenta personal autorizada y permisos acordados:

```bash
cd /var/src
(umask 022; git clone https://github.com/ElFeliii/Pizarra-UDEC-Giia pizarra-udec)
cd /var/src/pizarra-udec
test -e .env || cp .env.example .env
chmod 600 .env
mkdir -p data
sudo chown 1000:1000 data
sudo chmod 700 data
docker compose build
```

Para una instalación existente, conservar y respaldar sus datos antes de adaptar permisos;
no ejecutar otra clonación encima. La condición anterior preserva un `.env` existente.

Generar una clave distinta por moderador y guardarla por canal privado:

```bash
docker run --rm --network none --entrypoint node pizarra-udec:latest \
  -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Editar `.env` con un editor autorizado. `MOD_USERS` viene vacío: completar el formato
`nombre:clave,nombre:clave`, encerrando el valor completo entre comillas simples para evitar
interpolación. No usar comas en claves ni dos puntos en nombres. Cada clave individual
necesita **12 caracteres como mínimo**; se recomiendan las claves aleatorias del generador.
No usar la clave de desarrollo ni marcadores de ejemplo. No compartir claves en GitHub,
tickets o capturas; el límite de intentos no sustituye una clave fuerte.

| Variable de `.env`  | Valor y función                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUERTO_PUBLICADO`  | Puerto aprobado y libre del anfitrión; 3000 por defecto                                                                                         |
| `MOD_USERS`         | Credenciales individuales del panel; completar antes de iniciar                                                                                 |
| `MOD_PASSWORD`      | Maestra opcional sin valor predeterminado; mínimo 12 caracteres aleatorios y firma fija `Emergencia`. Dejar vacía salvo necesidad aprobada      |
| `SESSION_SECRET`    | Vacía: genera y persiste `data/session-secret`. Si se fija: mínimo 32 caracteres aleatorios                                                     |
| `TRUST_PROXY`       | Compose usa `1` por omisión sólo para un proxy local y backend en `127.0.0.1`; `false` para ensayo directo. Adaptar con GIIA a otras topologías |
| `AUTO_HIDE_REPORTS` | Reportes distintos para autoocultar contenido de asistentes; 3 por defecto, 0 desactiva. El equipo conserva reportes y ocultado manual          |

Docker fija `NODE_ENV=production`, puerto interno 3000 y SQLite en `/app/data/pizarra.db`;
Node escucha dentro en `0.0.0.0`. Cambiar `PUERTO_PUBLICADO` no altera esos valores.
Sin `NODE_ENV`, el arranque directo también usa producción y exige credenciales válidas
antes de escuchar. Desarrollo se activa explícitamente con `npm run dev`/`dev:lan`
(bandera `--desarrollo`) o `NODE_ENV=development`; no usarlo en el servidor del evento.

La clave maestra siempre registra **Emergencia**, incluso si se escribe otro nombre al
entrar. Ese nombre está reservado y no se permite como moderador individual. Los nombres
se normalizan con NFKC, mayúsculas/minúsculas y espacios; una lista mal formada o con
identidades repetidas tras normalizar impide el arranque. Las cuentas individuales
conservan la identidad configurada.

```bash
docker compose up -d --no-build --wait --wait-timeout 120
docker compose ps
docker compose port pizarra 3000
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Debe indicar `healthy`; un error exige revisar permisos, configuración y registros del
servicio antes de continuar. El secreto persiste junto a SQLite. El runtime conserva Node
y retira npm/Corepack; las herramientas de datos se ejecutan con Node, no con npm.

## 4. Proxy y aceptación pública

La Célula configura DNS, certificado y proxy hacia el puerto publicado real. Conservar
`Host`, `X-Forwarded-For` y `X-Forwarded-Proto`; reenviar `Upgrade`/`Connection` para
WebSocket. No confiar en cabeceras de cualquier origen ni abrir el backend al público.
Las IP reales son necesarias para que los límites anti-spam no agrupen a todos los asistentes.
`TRUST_PROXY=1` sólo corresponde a un único proxy local con backend en `127.0.0.1`;
no aplicarlo sin revisar una cadena distinta. El proxy debe sustituir/reenviar las
cabeceras coherentemente con esa confianza.

Usar los ejemplos [Nginx y Apache](DESPLIEGUE.md#3-proxy-con-websocket), sustituyendo dominio
y puerto; Apache requiere también `mod_headers` y `mod_ssl`. El certificado termina en el
proxy. Nginx reenvía al backend con HTTP/1.1 y tiempos de lectura/envío de 75 segundos;
el `map` de `Connection` se define en el contexto `http`. Preservar el puerto externo
en `Host` si se usa uno diferente de 443. La verificación HTTP local no comprueba DNS,
HTTPS ni esa configuración.

Deshabilitar la caché compartida de `/api/` y `/socket.io/`, incluidas las configuraciones
heredadas de Nginx/CDN. Conservar `Cache-Control: no-store` en la API dinámica y no ignorarlo.
Invalidar respuestas API guardadas antes de actualizar. Consultar el panel con una sesión
válida y luego las mismas URL sin cookie: deben responder 401, sin datos privados.
El ejemplo Nginx desactiva `proxy_cache` para esta aplicación; los archivos estáticos con
hash siguen teniendo caché en el navegador.

El cliente admite HTTP long-polling si falla WebSocket, pero esa alternativa requiere
validar los GET/POST de `/socket.io/`, cookies, reconexión y carga con el Nginx real.
No presentarla como garantía de funcionamiento. Seguir el
[ensayo de ambos transportes](DESPLIEGUE.md#comprobar-los-dos-transportes), bloqueando
el upgrade únicamente en un entorno de pruebas y restituyéndolo al terminar.

Antes del evento, comprobar desde fuera de la universidad, en computador y celular:

- HTTPS válido, página completa y fichas con fotos/descripciones al hacer clic.
- WebSocket estable; notas, respuestas y acciones de moderación llegan al otro navegador sin recargar.
- Con upgrade deshabilitado deliberadamente en pruebas, el cliente real completa las
  mismas acciones por polling; registrar transporte observado, reconexión y carga.
- Entrada al participar, búsqueda, respuestas y filtro de groserías.
- Acceso de cada moderador y rechazo de credenciales incorrectas.
- Cambio de sección visible al instante y respeto de solo lectura/oculta.
- Exportación CSV legible en Excel y restauración de respaldo ensayada.

## 5. Operación del evento

Se puede explorar sin cuenta; para participar se solicita nombre e institución. Secciones:
Mapa, Pizarra, Consejos, Historias, Carreras y Preguntas frecuentes. El mapa admite pines
dentro del campus, búsqueda y zoom limitado; sus 85 edificios abren fichas. Hay **85
descripciones con fuente y 34 fotos en 25 edificios**; **60 edificios siguen sin foto validada**.

Entrar a `/moderador` con credencial individual. El panel revisa reportes, oculta/restaura
contenido, administra palabras y silencios, presenta estadísticas y exporta CSV. Las notas
y respuestas firmadas por moderadores muestran corona y borde; su autoría requiere sesión
autenticada. Sus publicaciones conservan los filtros y permisos de sección.

En **Secciones**, cambiar entre abierta, solo lectura y oculta, o aplicar **Modo universitarios**
antes del evento y **Modo puertas abiertas** el día del evento. Este último deja los muros
para lectura y mantiene mapa/pizarra abiertos. El control se aplica a todos por sección;
la institución declarada es estadística, no un rol de acceso.

Carreras usa temas por campus/facultad con buscador y filtros. FAQ inicia vacía por decisión
del equipo: agregar preguntas desde Secciones y responder mediante notas/hilos normales.
Las encuestas están descartadas y la asistencia por IA permanece en pausa. Preparar el
contenido y ensayar con los moderadores antes del evento; al reiniciar vuelven a iniciar sesión.

## 6. Actualizar, respaldar y recuperar

Antes de actualizar, revisar credenciales individuales y maestra: si alguna tiene menos
de 12 caracteres o es de desarrollo/ejemplo, rotarla por canal privado conservando las
demás variables del `.env`. Mantener la maestra vacía salvo necesidad aprobada y comprobar
que ninguna cuenta individual usa la identidad reservada `Emergencia`. Hacer el respaldo
completo protegido y comprobarlo antes de migrar.

Para rotar o retirar credenciales sin actualizar código, acordar la interrupción, editar
`.env` conservando permisos `600` y ejecutar:

```bash
docker compose up -d --force-recreate --wait --wait-timeout 120
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Esto carga las credenciales nuevas y elimina las sesiones de moderación en memoria, sin
borrar SQLite ni el secreto persistido. Comprobar que las cookies y claves anteriores
se rechazan y que la clave nueva permite entrar. Editar `.env` sin recrear no revoca
sesiones; `docker compose restart` conserva las variables originales del contenedor.

```bash
cd /var/src/pizarra-udec
git status --short
git branch --show-current
# Continuar sólo en main, tras revisar cambios y validar el respaldo completo.
git pull --ff-only
docker compose up -d --build --wait --wait-timeout 120
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

[DESPLIEGUE, sección 5](DESPLIEGUE.md#5-respaldo-y-exportación) contiene los comandos exactos:
copia en frío mediante Docker de todo `data/`, WAL/SHM y secreto; `.env`, Compose,
instituciones, commit e imagen exportada; carpeta fuera del repositorio con permisos
700/600, integridad SQLite y hashes. La validación mantiene el respaldo de solo lectura y
usa una copia temporal en `tmpfs`; su capacidad/RAM debe acordarse con la Célula.

La recuperación prepara un clon del commit guardado, restaura datos/configuración e imagen
del mismo respaldo y conserva la instalación actual renombrada. Requiere acceso Git o un
mirror autorizado; importar sólo la imagen no proporciona el código. Recuperar una copia
anterior deja fuera publicaciones posteriores: conservar la instalación retirada para
revisión. No usar una imagen vieja contra una base ya migrada sin verificar compatibilidad.

## 7. Seguridad, mantenimiento e incidentes

Verificación local de la revisión ampliada del **14 de octubre**: **523 pruebas en 42
archivos**, tipos, lint y compilación aprobados. Nginx con caché compartida deliberada
rechazó lecturas privadas sin sesión; 20 controles HTTPS/WSS/polling pasaron y la carga
entregó 24.000 mensajes sin rechazos. La imagen y el alcance del análisis de paquetes están
en [ENTREGA-VERIFICACION.md](ENTREGA-VERIFICACION.md); la aceptación institucional sigue pendiente.

Resultados históricos de la revisión local del **8 y 9 de octubre de 2026**: 394 pruebas en 30
archivos; tipos, lint y compilación con salida 0; auditoría npm con cero vulnerabilidades
conocidas; Docker `healthy` en loopback, puerto 3189 de ensayo; 24.000/24.000 entregas en carga.
El escaneo detectó cero avisos Node y **222 avisos por paquete Debian, 93 CVE**, sin versión
corregida indicada en la base consultada. **No es una certificación de cero vulnerabilidades.**
Estos resultados previos no certifican la actualización posterior ni el Nginx de GIIA.
La aplicabilidad de avisos y el servidor público requieren revisión de GIIA.
Ver [evidencia fechada](ENTREGA-VERIFICACION.md), [seguridad](SEGURIDAD.md),
[informe de imagen](seguridad-imagen.json) y [contraste del manual](CUMPLIMIENTO-GIIA.md).

Precauciones: no publicar el historial original, `.env`, datos ni respaldos; compartir la
copia saneada y documentos, excluyendo `CONTINUAR.md`. No usar `down -v`, borrar WAL/SHM o
forzar Git como recuperación. No mover/regenerar `campus.json` después de tener pines reales.
Usar exclusivamente fotos propias o libres con crédito/licencia. Tras el evento, aplicar
la [anonimización de IP](DESPLIEGUE.md#10-después-del-evento-qué-hacer-con-los-datos), respaldando antes.

Para retirar una persona o vaciar el evento, seguir el
[procedimiento de borrado con el servicio detenido](DESPLIEGUE.md#borrar-con-el-servicio-detenido):
respaldo validado, ventana sin participantes, `compose stop`, herramienta en contenedor
temporal, reinicio y comprobación de notas, respuestas, búsqueda y ranking. La herramienta
repara estadísticas y notifica su revisión a la caché; detener/reiniciar también evita
conexiones y vistas anteriores. No ejecutar borrados durante la participación activa.

GIIA debe programar actualizaciones cada viernes fuera del horario de uso y atención urgente de
CVE relevantes; reconstruye, escanea y verifica antes de activar. Monitorea externamente
CPU, RAM, disco y red; programa respaldos de configuración/volúmenes al fin de mes según
3-2-1 y retención de logs de máximo 365 días, con revisión periódica. Compose limita tamaño
a 5 archivos de 10 MB; ese límite no controla antigüedad. Reportar inmediatamente errores,
accesos sospechosos o pérdida de credenciales por el canal acordado, sin adjuntar secretos;
la Célula coordina respuesta y revocación/rotación.

## Pendientes de GIIA

**Ticket y aprobaciones; recursos, fechas, accesos y puerto; instalación en `/var/src`;
dominio, DNS, certificado y proxy; evaluación de avisos y seguridad del host; aceptación
pública; responsables de incidentes, mantenimiento, monitoreo, logs y respaldos 3-2-1.**
La dirección definitiva continúa pendiente. El equipo del evento prepara FAQ y ensayo;
las 60 fotografías faltantes son pendientes de contenido, no trámites de GIIA.
