# Despliegue en el servidor de la UdeC

La aplicación es **un solo contenedor Docker**: el mismo proceso entrega la página, la API y
el tiempo real (WebSocket). Los datos quedan en un archivo SQLite dentro de la carpeta `data/`.

> Dirección de ejemplo: **https://pizarra.giia.udec.cl**. El administrador debe confirmar el
> subdominio, configurar DNS y emitir el certificado; esta URL todavía no está asignada.
> Resumen para la entrega: [ENTREGA.md](ENTREGA.md).

En GIIA, solicitar el levantamiento exclusivamente por la plataforma de tickets. La Célula
aprueba recursos y accesos, instala bajo `/var/src` y configura el proxy. Docker y Compose
son obligatorios; los ejemplos Node de la sección 8 solo corresponden a otros entornos.

## Requisitos

- Docker con el plugin `docker compose`.
- Propuesta inicial: **1 vCPU y 1 GB de RAM**, sujeta a aprobación y ensayo del evento.
  El ensayo local actual difundió 40 pines a 600 lectores, sin rechazos. La muestra
  posterior fue de 79,99 MiB; no mide el pico ni garantiza capacidad del servidor real.
  La imagen actual ocupa unos 444 MB. Ver [evidencia y límites](ENTREGA-VERIFICACION.md).
- Unos 2 GB de disco para la imagen y la base de datos.
- Un subdominio con HTTPS (por ejemplo `pizarra.giia.udec.cl`) apuntando a un proxy (Nginx/Apache)
  que reenvíe al contenedor. El proxy **debe permitir WebSocket** (ver abajo).

### Qué pedirle a quien administra el servidor

Incluir en el ticket oficial de GIIA:

1. **Docker y `docker compose`** disponibles para la cuenta personal autorizada, con los
   permisos que la Célula asigne para proyectos aprobados; no compartir cuentas o claves SSH.
2. **Salida a internet durante la construcción de la imagen**: `docker build` descarga la
   imagen base `node:22-slim`, las actualizaciones de Debian y las dependencias desde npm. Si el servidor está aislado, ver la
   sección 9.
3. **Un subdominio con certificado** y una entrada en el proxy que ya tengan (Nginx o Apache),
   con WebSocket habilitado. El contenedor no termina TLS: eso lo hace el proxy.
4. **Instalación en `/var/src/pizarra-udec`** y permisos acordados por la Célula, unos
   **2 GB de disco** iniciales más la capacidad necesaria para logs y respaldos.
5. **Un puerto libre de aplicación en localhost**, asignado mediante `PUERTO_PUBLICADO`
   en `.env` (3000 por defecto); no requiere editar `docker-compose.yml`.
6. Que el proxy pase `X-Forwarded-For`. Sin eso, todos los asistentes se ven como una sola IP
   y los límites anti-spam los tratan como si fueran la misma persona.

> **La imagen está construida y probada** (27 de septiembre de 2026, Docker 29.8 sobre
> Windows con WSL 2). Se verificó, dentro del contenedor: publicar una nota y responderla por
> WebSocket, el filtro de groserías, las fichas de edificios con sus fotos, la búsqueda de
> lugares, el panel de moderación con `/moderador`, ocultar contenido, la exportación CSV con
> BOM, la herramienta de datos, y que todo sobreviva a `docker compose restart`. Aun así,
> **hagan la primera construcción en el servidor varios días antes del evento**: ahí puede
> fallar la red, el proxy o los permisos, que es lo que no se puede probar desde fuera.

## 1. Levantar

```bash
# Después del ticket aprobado y de preparar los permisos de /var/src.
cd /var/src
git clone https://github.com/ElFeliii/Pizarra-UDEC-Giia pizarra-udec
cd /var/src/pizarra-udec
```

Crear el archivo `.env` con **quiénes moderan**. Es lo único obligatorio, porque las claves no
están en el código y se entregan por un canal privado separado del repositorio.
Comprobar acceso al repositorio; tramitar autorización si GitHub la exige.

```bash
test -e .env || cp .env.example .env
chmod 600 .env
# Editar MOD_USERS, PUERTO_PUBLICADO y TRUST_PROXY antes de iniciar.
```

Las claves del evento las reparte el equipo organizador. En Linux, preparar una carpeta
de datos escribible por el usuario del contenedor (UID/GID 1000):

```bash
mkdir -p data
sudo chown 1000:1000 data
sudo chmod 700 data
```

El administrador debe poder asignar esos permisos. En una instalación existente, respaldar
y conservar los datos antes de adaptar su propietario. Y levantar:

```bash
docker compose up -d --build --wait --wait-timeout 120
```

Lo demás se resuelve solo: el secreto que firma las sesiones se genera y se guarda en
`data/session-secret` (sobrevive a los reinicios), y Compose usa `TRUST_PROXY=1` por
omisión para el despliegue con un único proxy HTTPS local y el puerto Docker
publicado solo en `127.0.0.1`. El salto Docker puede llegar desde una IP de puente, no desde
loopback. Si la U usa una cadena de proxies distinta, el administrador debe ajustar la confianza.

Reemplazar la clave de ejemplo antes de iniciar. No usarla como credencial del evento.

Si falta el `.env`, el contenedor no arranca y el registro dice exactamente qué poner.

La Célula configura el proxy HTTPS (sección 3) y las tareas administrativas de
[ENTREGA.md](ENTREGA.md#pendientes-administrativos-de-giia).

### Comprobar que quedó arriba

```bash
docker compose ps          # debe decir "healthy"
docker compose logs -f     # ver registros
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Docker publica en `127.0.0.1:<PUERTO_PUBLICADO>`; dentro del contenedor Node escucha en 3000. `docker compose port pizarra 3000` muestra el puerto real del servidor. Para una prueba
local sin proxy usar `TRUST_PROXY=false`. Cualquier exposición a otra interfaz en GIIA requiere
la aprobación y configuración de la Célula.

## 2. Ajustes opcionales

Editar únicamente las variables necesarias en el `.env` existente, sin volver a copiar
`.env.example` encima. Mantener sus permisos `600` y aplicar el cambio con
`docker compose up -d --wait --wait-timeout 120`. La lista `MOD_USERS` del ejemplo está vacía.

| Variable            | Qué poner                                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUERTO_PUBLICADO`  | Puerto del servidor asignado por GIIA, publicado solo en localhost; por defecto `3000`.                                                                                                                   |
| `MOD_USERS`         | **Obligatoria.** Moderadores del panel `/moderador`, como `nombre:clave` separados por coma. Sin esto (o sin `MOD_PASSWORD`) el servidor no arranca.                                                      |
| `MOD_PASSWORD`      | Clave maestra opcional, sin valor predeterminado: mínimo 12 caracteres y acciones firmadas siempre como `Emergencia`. Dejar vacía salvo necesidad aprobada.                                               |
| `SESSION_SECRET`    | Solo si prefieres fijarlo tú (32+ caracteres aleatorios). Si se deja vacía, el servidor genera uno y lo guarda en `data/session-secret`.                                                                  |
| `TRUST_PROXY`       | Compose usa `1` por omisión, sólo para un proxy local y backend publicado en `127.0.0.1`. El código directo usa `loopback`. Otra topología requiere IP o saltos aprobados; `false` para probar sin proxy. |
| `AUTO_HIDE_REPORTS` | Reportes de usuarios distintos que autoocultan contenido de asistentes (por defecto `3`, `0` desactiva). Las publicaciones firmadas por moderación conservan reportes y ocultado manual.                  |

### Credenciales individuales

Usar claves individuales aleatorias y largas desde la primera puesta en producción,
incluso durante el evento. Cada clave de `MOD_USERS` necesita al menos 12 caracteres;
se recomiendan 24 bytes aleatorios en base64url. El servidor rechaza la clave de desarrollo
y marcadores de ejemplo. Los límites de intentos complementan claves fuertes y HTTPS;
no demuestran que una clave corta sea segura durante unas horas.

Con la imagen construida (`docker compose build`), generar una clave para cada persona:

```bash
docker run --rm --network none --entrypoint node pizarra-udec:latest \
  -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Node permanece en la imagen; este comando no necesita npm, no inicia la aplicación y no
monta sus datos. Guardar las claves por el canal privado del equipo. En `.env`, encerrar el
valor completo de `MOD_USERS` entre comillas simples para evitar interpolación de Compose.
No usar comas en las claves ni dos puntos en los nombres. Cada moderador usa su cuenta;
la clave maestra permanece vacía salvo necesidad aprobada. Exige al menos 12 caracteres,
no acepta claves de desarrollo o marcadores y firma siempre como **Emergencia**, aunque
se escriba el nombre de otra persona. Ese nombre está reservado y no se admite en `MOD_USERS`.

Los nombres se comparan con normalización Unicode NFKC, sin diferencias de mayúsculas
ni espacios: "Moderador 1", "moderador 1" y "moderador1" identifican a la misma persona.
El arranque rechaza nombres repetidos después de normalizar o una lista mal formada;
las credenciales individuales conservan el nombre configurado en el registro.

### Rotar o retirar una credencial

Editar `MOD_USERS` o `MOD_PASSWORD` en el `.env` existente, conservar permisos `600` y
entregar la nueva clave por el canal privado. Acordar la interrupción y recrear el servicio:

```bash
docker compose up -d --force-recreate --wait --wait-timeout 120
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

La recreación carga la configuración nueva y vacía las sesiones de moderación en memoria:
las cookies anteriores y las claves retiradas deben dejar de dar acceso. Verificar ese
rechazo y un inicio de sesión con la clave nueva. Editar `.env` sin recrear no revoca
sesiones; `docker compose restart` reinicia con las variables originales del contenedor.
El secreto persistente y la base no se borran para rotar una credencial.

Editar la lista de colegios y universidades en `server/data/instituciones.json`:

```json
[
  { "id": "colegio-ejemplo-1", "name": "Colegio ejemplo 1", "type": "colegio" },
  { "id": "universidad-ejemplo-1", "name": "Universidad ejemplo 1", "type": "universidad" }
]
```

- `id`: minúsculas, números y guiones; único; no usar `otra` (reservado).
- `type`: `colegio` o `universidad`. La opción "Otra" (texto libre) se agrega sola.
- El archivo se monta en el contenedor: tras editarlo basta `docker compose restart`.

## 3. Proxy con WebSocket

Estos ejemplos usan el puerto de ejemplo 3000 y un subdominio no asignado. La Célula
debe reemplazarlos por el valor de `PUERTO_PUBLICADO` y el dominio aprobado.

### Nginx

El `map` va en el contexto `http` de Nginx, fuera de cualquier bloque `server` o `location`.
La Célula adapta las directivas TLS a su versión; no duplicar un `map` existente con el
mismo nombre. El ejemplo reenvía todas las rutas, incluida `/socket.io/`, al mismo backend.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name pizarra.giia.udec.cl;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        # Evita heredar una caché compartida para API y Socket.IO.
        proxy_cache off;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;
    }
}
```

El `Host` conserva también un puerto externo si lo hay; `X-Forwarded-Proto` informa el
HTTPS terminado en el proxy. La confianza debe coincidir con esa topología para aceptar
el mismo origen externo y establecer cookies seguras. Socket.IO usa 25 segundos de
intervalo de ping y 20 de espera: los 75 segundos del proxy superan su suma de 45.
Validar la configuración con `nginx -t` antes de recargar según el procedimiento de GIIA.
Referencias: [WebSocket en Nginx](https://nginx.org/en/docs/http/websocket.html) y
[Socket.IO detrás de un proxy](https://socket.io/docs/v4/reverse-proxy/).

### Caché y contenido privado

No habilitar caché compartida para `/api/` ni `/socket.io/`, aunque exista en otros sitios
del servidor. El ejemplo desactiva `proxy_cache` para esta aplicación. La API dinámica
envía `Cache-Control: no-store`, incluidas sesiones, panel, errores, hilos y búsquedas;
no eliminar esa cabecera ni usar `proxy_ignore_headers Cache-Control` para estas rutas.
El catálogo estático de instituciones y los archivos con hash conservan su caché pública.

Al actualizar desde una versión anterior, la Célula debe invalidar cualquier respuesta
API almacenada previamente en Nginx/CDN. La cabecera nueva no retira entradas ya guardadas.
Comprobar que `/api/admin/feed` y `/api/admin/users` sin cookie responden 401 aun después
de que un moderador haya consultado esas mismas URL, y que el logout revoca el acceso.
Comprobar también que ocultar una nota retira su hilo y sus resultados de búsqueda.

### Apache (con `mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel`, `mod_rewrite`, `mod_headers` y `mod_ssl`)

```apache
<VirtualHost *:443>
    ServerName pizarra.giia.udec.cl
    # SSLEngine on ...

    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/(.*) ws://127.0.0.1:3000/$1 [P,L]

    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

### Comprobar los dos transportes

El cliente intenta WebSocket y permite probar **HTTP long-polling** si falla el otro
transporte. Esta alternativa requiere que el proxy acepte los GET/POST de `/socket.io/`
sin reescribir la ruta ni perder cookies, origen o parámetros. Supone más peticiones HTTP;
no se garantiza su funcionamiento ni capacidad detrás del Nginx de GIIA sin ensayarlo.

En una instalación de pruebas, desde fuera de la universidad y con dos navegadores:

1. Confirmar HTTPS y WebSocket: `/socket.io/` cambia a `101 Switching Protocols` y conserva
   la conexión más de 75 segundos sin cortes inesperados. Publicar notas y respuestas,
   cambiar secciones y moderar; el otro navegador refleja cada cambio sin recargar.
2. Deshabilitar deliberadamente el upgrade sólo en el proxy de pruebas. Verificar que el
   cliente real pasa a polling y completa las mismas acciones mediante GET/POST, sin
   errores de autenticación ni cambios en los permisos. Recargar entre ensayos.
3. Interrumpir y recuperar temporalmente la conexión; verificar reconexión y lectura del
   contenido vigente. Comprobar también IP real y cookies `Secure`/`HttpOnly` por HTTPS.
4. Ensayar la carga prevista con ambos transportes. Los límites anti-spam siguen activos;
   probar asistentes que comparten WiFi y abuso controlado, sin usar datos reales.

Restituir WebSocket después del ensayo y registrar versión/configuración del proxy,
transporte observado y resultados. Que abra la página o responda `/api/health` no prueba
la publicación ni la moderación en tiempo real. Esta aceptación en el servidor real
corresponde a la Célula y sigue pendiente hasta que se ejecute.

## 4. Durante el evento

- **Moderación:** entrar a `https://pizarra.giia.udec.cl/moderador` con el nombre y la clave asignados.
  Cada acción queda firmada con ese nombre en el registro.
  - _Revisión:_ contenido reportado y lo ocultado automáticamente (restaurar o mantener oculto).
  - _En vivo:_ todo lo que se publica, con ocultar en un clic.
  - _Palabras:_ agregar/quitar palabras prohibidas (se aplican al instante) y ocultar lo ya publicado que las contenga.
  - _Usuarios:_ silenciar (pueden leer, no publicar).
  - Con la sesión de moderador abierta, en la propia pizarra aparecen botones de ocultar/silenciar en cada hilo.
- **Estado:** `docker compose ps`, `docker stats pizarra-udec`, `curl --fail "http://$(docker compose port pizarra 3000)/api/health"`.
- Si el contenedor se reinicia, **los moderadores tienen que volver a entrar**: las sesiones
  viven en memoria. Los datos y el contenido oculto no se pierden.

## 5. Respaldo y exportación

En GIIA, la Célula programa respaldos al final de cada mes según 3-2-1: tres copias,
dos tipos de soporte y una fuera del servidor. Deben incluir las configuraciones del
servidor y los volúmenes. Los comandos siguientes cubren este proyecto y permiten
restaurarlo; no crean por sí solos esa programación ni los destinos externos.

Los respaldos contienen información de participantes y secretos: no subirlos a GitHub,
adjuntarlos al ticket ni publicar su contenido. Usar destinos protegidos y la política de
cifrado y acceso que establezca la Célula. Reservar espacio adicional para copias y sus
imágenes Docker; los 2 GB iniciales de la aplicación no incluyen ese espacio.

La exportación CSV del panel permite analizar pines, respuestas y asistentes; no sustituye
un respaldo completo. Estos comandos se ejecutan en **Bash sobre Linux**, con acceso Docker
aprobado. No suponen que la cuenta SSH tenga UID 1000: Docker obtiene los archivos del
contenedor. La carpeta de datos del servicio permanece privada para UID/GID 1000.

### Respaldo completo en frío antes de actualizar

La copia en frío detiene brevemente la publicación; acordar la ventana. Guarda juntos:
SQLite y sus archivos WAL/SHM si existen, secreto de sesiones, `.env`, Compose, lista de
instituciones, commit y la imagen de ejecución. Copiar todo `/app/data/` evita separar la
base de transacciones que aún estuvieran en WAL. No borrar esos archivos manualmente.

Los bloques usan el Compose versionado y su etiqueta `pizarra-udec:latest`. Antes de
respaldar, confirmar que el commit instalado corresponde a la imagen activa y a la versión
aprobada; registrar esa relación en el ticket. Si la Célula usa otras etiquetas o archivos
Compose, adaptar los comandos y respaldar esa configuración completa.

Desde `/var/src/pizarra-udec`, con el servicio funcionando y su imagen disponible:

```bash
set -euo pipefail
cd /var/src/pizarra-udec
umask 077
mkdir -p "$HOME/respaldos/pizarra-udec"
chmod 700 "$HOME/respaldos/pizarra-udec"
marca=$(date -u +%Y%m%dT%H%M%SZ)
respaldo=$(mktemp -d "$HOME/respaldos/pizarra-udec/${marca}-XXXXXX")
mkdir -m 700 "$respaldo/data"

git rev-parse HEAD > "$respaldo/commit.txt"
contenedor=$(docker compose ps -q pizarra)
test -n "$contenedor"
imagen=$(docker inspect --format '{{.Image}}' "$contenedor")
printf '%s\n' "$imagen" > "$respaldo/imagen-id.txt"
docker image save --output "$respaldo/imagen.tar" "$imagen"
cp .env "$respaldo/.env"
cp docker-compose.yml "$respaldo/docker-compose.yml"
cp server/data/instituciones.json "$respaldo/instituciones.json"

# Ante un fallo de copia, intentar volver a iniciar la instalación que ya estaba activa.
trap 'docker compose start pizarra >/dev/null' EXIT
docker compose stop pizarra
docker compose cp pizarra:/app/data/. "$respaldo/data/"
docker compose start pizarra
trap - EXIT
chmod -R go-rwx "$respaldo"

# Mantener el respaldo de sólo lectura; SQLite verifica una copia temporal escribible.
docker run --rm --network none --read-only --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=512m,mode=1777 \
  --mount "type=bind,source=$respaldo/data,target=/respaldo,readonly" \
  --entrypoint node "$imagen" -e '
const fs = require("node:fs");
const path = require("node:path");
const D = require("better-sqlite3");
const temporal = fs.mkdtempSync("/tmp/verificar-");
let db;
try {
  for (const sufijo of ["", "-wal", "-shm"]) {
    const nombre = "pizarra.db" + sufijo;
    const origen = path.join("/respaldo", nombre);
    if (fs.existsSync(origen)) fs.copyFileSync(origen, path.join(temporal, nombre));
  }
  db = new D(path.join(temporal, "pizarra.db"), { readonly: true, fileMustExist: true });
  const resultado = db.pragma("integrity_check", { simple: true });
  const version = db.pragma("user_version", { simple: true });
  if (resultado !== "ok") throw new Error("integrity_check=" + resultado);
  console.log("integrity_check=ok; user_version=" + version);
} finally {
  try { if (db) db.close(); }
  finally { fs.rmSync(temporal, { recursive: true, force: true }); }
}'

(cd "$respaldo" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
chmod 600 "$respaldo/SHA256SUMS"
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
printf 'Respaldo protegido: %s\n' "$respaldo"
```

Si la validación falla, conservar la copia y examinar el error antes de actualizar. La imagen
se exporta antes de detener el servicio y se incluye para recuperar esa versión aunque cambie
la etiqueta `latest`. Docker debe poder leer y montar la ruta del respaldo en el anfitrión Linux;
no ejecutar la validación en un Docker remoto que no disponga de esa ruta.

SQLite puede necesitar crear sus archivos auxiliares aunque la conexión sea de sólo lectura
cuando la base conserva [el modo WAL](https://www.sqlite.org/wal.html). Por eso el respaldo
permanece en un bind de sólo lectura y la comprobación copia la base y sus WAL/SHM, si existen,
a un directorio temporal dentro de `/tmp`; al terminar elimina únicamente esa copia temporal.
El `tmpfs` de 512 MiB debe alojar la base, los WAL/SHM y los auxiliares necesarios. Si la copia
es mayor, acordar capacidad y RAM con la Célula y ajustar `size` antes de validar; un fallo por
falta de espacio no permite dar el respaldo por comprobado.

La carpeta obtenida es el respaldo que se debe trasladar a los destinos protegidos 3-2-1.
Si se usan archivos Compose adicionales, configuración del proxy o secretos externos, la
Célula debe agregarlos a su respaldo institucional y documentar cómo se restablecen. No usar
`docker compose config` para compartir información: su salida puede revelar claves interpoladas.

### Restaurar o volver a una versión anterior

Usar **el código, imagen, configuración y datos del mismo respaldo**. Una imagen vieja con
una base ya migrada puede ser incompatible. Esta restauración devuelve las publicaciones
al momento de la copia: las posteriores quedan fuera de la página recuperada; la instalación
actual se conserva completa en otra carpeta para inspección y recuperación por la Célula.

Requiere la aprobación de la Célula, permisos en `/var/src`, `sudo` para los datos y acceso al
repositorio saneado. Si requiere autorización, obtenerla antes de restaurar. El flujo
clona el código desde GitHub: importar la imagen no reemplaza
ese acceso. Si el servidor está totalmente aislado, la Célula debe disponer de un mirror
aprobado del repositorio saneado, con el commit del respaldo, y adaptar la URL de clonación.
Ejecutar primero la comprobación de hashes y de integridad anterior, cargando la imagen desde
`imagen.tar` si ya no está disponible. No continuar si falla.

```bash
set -euo pipefail
respaldo="/ruta/absoluta/al/respaldo-protegido"
(cd "$respaldo" && sha256sum --check SHA256SUMS)
commit=$(cat "$respaldo/commit.txt")
imagen=$(cat "$respaldo/imagen-id.txt")
docker image load --input "$respaldo/imagen.tar"

# Preparar la candidata antes de detener la aplicación actual.
marca=$(date -u +%Y%m%dT%H%M%SZ)
base=/var/src
instalacion="$base/pizarra-udec"
candidata="$base/pizarra-udec-recuperacion-$marca"
anterior="$base/pizarra-udec-anterior-$marca"
test -d "$instalacion"
test ! -e "$candidata"
test ! -e "$anterior"
(umask 022; git clone https://github.com/ElFeliii/Pizarra-UDEC-Giia "$candidata")
git -C "$candidata" switch --detach "$commit"
install -m 600 "$respaldo/.env" "$candidata/.env"
install -m 644 "$respaldo/docker-compose.yml" "$candidata/docker-compose.yml"
install -m 644 "$respaldo/instituciones.json" "$candidata/server/data/instituciones.json"
sudo install -d -o 1000 -g 1000 -m 700 "$candidata/data"
sudo cp -a "$respaldo/data/." "$candidata/data/"
sudo chown -R 1000:1000 "$candidata/data"
sudo find "$candidata/data" -type d -exec chmod 700 {} +
sudo find "$candidata/data" -type f -exec chmod 600 {} +

docker tag "$imagen" pizarra-udec:latest
cd "$instalacion"
docker compose stop pizarra
cd "$base"
mv "$instalacion" "$anterior"
mv "$candidata" "$instalacion"
cd "$instalacion"
docker compose up -d --no-build --force-recreate --wait --wait-timeout 120
docker compose ps
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
docker compose exec -T pizarra node -e "const D=require('better-sqlite3'); const db=new D('/app/data/pizarra.db',{readonly:true,fileMustExist:true}); const r=db.pragma('integrity_check',{simple:true}); const v=db.pragma('user_version',{simple:true}); db.close(); if(r!=='ok'){console.error(r);process.exit(1)} console.log('integrity_check=ok; user_version='+v)"
printf 'Instalación anterior conservada: %s\n' "$anterior"
```

Verificar además HTTPS, publicación entre dos navegadores, moderación, mapa y exportación
con los datos esperados. Si el inicio falla, conservar ambas carpetas y las imágenes; no
borrar la instalación anterior ni forzar un cambio de esquema. El proyecto Compose vuelve a
usar `/var/src/pizarra-udec`, y `--force-recreate` remonta sus datos recuperados. La imagen
previa se utiliza sin reconstruir, con la configuración guardada en la copia.

El clon recuperado queda en el commit de respaldo, con HEAD separado deliberadamente. Para
retomar actualizaciones normales, la Célula confirma primero que la nueva versión y sus
migraciones admiten esa base, realiza otro respaldo completo y revisa cambios locales.
Después, `git switch main` y `git pull --ff-only` recuperan la rama publicada; se construye
y comprueba la nueva versión siguiendo la sección 6. No usar `reset --hard`, borrar WAL/SHM,
`down -v` ni eliminar la carpeta anterior como atajo para resolver una recuperación.

## 6. Actualizar

Esta versión exige claves individuales y maestras de al menos 12 caracteres y rechaza
credenciales de desarrollo y marcadores de ejemplo. La maestra no tiene valor
predeterminado y usa la identidad reservada `Emergencia`. Antes de actualizar, revisar
`MOD_USERS` y `MOD_PASSWORD`: si
no cumplen, sustituir únicamente esas credenciales en el `.env` existente por claves aleatorias
largas. Conservar las demás variables, mantener permisos `600` y entregar las nuevas claves
por el canal privado del equipo. Un `.env` antiguo no debe sobrescribirse con el ejemplo;
si conserva credenciales incompatibles, el servicio rechazará el inicio.

Acordar la ventana, realizar el respaldo completo de la sección 5 y verificarlo. Antes de
actualizar, comprobar que el clon está en `main` y que no hay modificaciones versionadas
sin revisar, especialmente en Compose o instituciones. No sobrescribirlas con comandos Git.

```bash
cd /var/src/pizarra-udec
git status --short
git branch --show-current
# Continuar únicamente después de revisar el estado y de conservar el respaldo completo.
git pull --ff-only
docker compose up -d --build --wait --wait-timeout 120
docker compose ps
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Tras el saneamiento inicial del historial (ver
[ENTREGA.md](ENTREGA.md#una-vez-pasar-desde-la-primera-publicación-a-la-entrega-saneada)),
las publicaciones continúan el historial limpio existente. No reemplazarlo por otra raíz:
eso impide `git pull --ff-only`. El historial local de desarrollo no se publica.

Si se detectan historiales incompatibles, conservar la instalación y recuperar mediante un
clon nuevo; no forzar el historial. `--build` incorpora el código actualizado, y las
migraciones se ejecutan al arrancar. Los datos se conservan durante una actualización normal;
los moderadores tienen que volver a entrar porque sus sesiones viven en memoria. Si se
necesita volver atrás, restaurar el conjunto coherente de la sección 5.

## 7. Reiniciar la pizarra para otro evento

Acordar el cambio con el equipo y hacer primero el respaldo completo protegido de la sección 5.
El siguiente procedimiento conserva la carpeta actual íntegra en ese respaldo, sin seleccionar
ni borrar archivos SQLite. Sustituir la ruta y comprobar que `data-retirados` todavía no existe:

```bash
set -euo pipefail
cd /var/src/pizarra-udec
respaldo="/ruta/absoluta/al/respaldo-protegido"
test -d "$respaldo"
test ! -e "$respaldo/data-retirados"
docker compose stop pizarra
sudo mv data "$respaldo/data-retirados"
sudo install -d -o 1000 -g 1000 -m 700 data
docker compose up -d --no-build --force-recreate --wait --wait-timeout 120
```

Se crea una base nueva con las semillas y estados iniciales; revisar secciones y volver a
cargar las preguntas del equipo. Si el secreto no se fija por entorno, también se genera uno
nuevo. Mantener la copia anterior protegida y aplicar su retención según la política del evento.

## 8. Otros entornos: Node directo

**Esta opción no se admite para el levantamiento en GIIA**, donde Docker y Compose son
obligatorios. En otro entorno autorizado, el mismo servidor puede ejecutarse con **Node 22
o superior**:

```bash
npm ci
npm run build
test -e .env || cp .env.example .env  # completar MOD_USERS y ajustar TRUST_PROXY
chmod 600 .env
NODE_ENV=production node server/dist/index.js
```

Escucha en el puerto 3000 y sirve la página, la API y el WebSocket igual que el contenedor. Para
que quede corriendo como servicio, un `systemd` mínimo:

```ini
[Unit]
Description=Pizarra UdeC
After=network.target

[Service]
Type=simple
User=pizarra
WorkingDirectory=/srv/pizarra-udec
EnvironmentFile=/srv/pizarra-udec/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now pizarra
journalctl -u pizarra -f
```

Sin `NODE_ENV`, el servidor también selecciona producción y falla antes de escuchar
si no hay credenciales válidas. Para desarrollo local, `npm run dev` y `npm run dev:lan`
pasan `--desarrollo`; también puede seleccionarse explícitamente `NODE_ENV=development`.
La bandera no se admite junto a un entorno de producción. No usar el modo de desarrollo
ni sus credenciales contra datos del evento.

La base de datos queda en `data/pizarra.db` dentro del proyecto (o donde apunte `DB_PATH`).

## 9. Si el servidor no tiene salida a internet

Construir la imagen en un computador que sí la tenga y llevarla en un archivo:

```bash
# En el computador con internet
docker build -t pizarra-udec:latest .
docker save pizarra-udec:latest | gzip > pizarra-udec.tar.gz

# En el servidor
gunzip -c pizarra-udec.tar.gz | docker load
docker compose up -d --no-build --wait --wait-timeout 120  # usa la imagen cargada
```

La opción `--no-build` impide la reconstrucción y permite conservar el YAML versionado
sin cambios. Transferir una imagen compatible con la arquitectura del servidor y comprobar
su identificador y su análisis de seguridad antes de usarla. Las actualizaciones posteriores
sin internet requieren importar una imagen nueva de la versión aprobada.

## 10. Después del evento: qué hacer con los datos

La pizarra guarda, además de los mensajes, **la dirección IP de cada asistente**: la necesita el
anti-spam mientras el evento está abierto y no le sirve a nadie después. Borrarla es lo primero.

```bash
# Dentro del contenedor
docker compose exec pizarra node server/dist/datos.js --resumen
docker compose exec pizarra node server/dist/datos.js --anonimizar-ips --si

# En desarrollo, sobre la base local
npm run datos -- --resumen
```

| Comando                         | Qué hace                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--resumen`                     | Cuánto hay guardado: asistentes, pines, respuestas, reportes y fechas. No toca nada.                                                        |
| `--anonimizar-ips`              | Borra las IP. Los mensajes, los nombres y las instituciones se conservan.                                                                   |
| `--borrar-usuario <id\|nombre>` | Borra a esa persona y todo lo que publicó, incluidas las respuestas que otros dejaron en sus pines. Para cuando alguien pide que lo saquen. |
| `--borrar-contenido`            | Vacía pines, respuestas, reportes y asistentes. Deja la lista de palabras y el registro de moderación.                                      |

Ninguna operación destructiva se ejecuta sin `--si`: sin esa bandera solo muestra qué haría.
**Respalda antes** (sección 5): no hay deshacer.

Estas operaciones se reservan a la cuenta de infraestructura autorizada, fuera del panel
web: permiten borrar información del evento y requieren respaldo y confirmación explícita.

### Borrar con el servicio detenido

Para `--borrar-usuario` y `--borrar-contenido`, acordar una ventana sin participantes y
validar antes el respaldo completo de la sección 5. Detener el servidor cierra conexiones,
evita publicaciones concurrentes. Detener por sí solo no borra el contenido ya dibujado;
el reinicio y la recarga posterior retiran las vistas anteriores.
No ejecutar estos borrados mediante `compose exec` mientras el evento sigue en uso.

```bash
docker compose stop pizarra
# Sustituir 42 por el ID exacto; sin --si primero muestra lo que se eliminaría.
docker compose run --rm --no-deps --entrypoint node pizarra \
  server/dist/datos.js --borrar-usuario 42
docker compose run --rm --no-deps --entrypoint node pizarra \
  server/dist/datos.js --borrar-usuario 42 --si
docker compose up -d --no-build --wait --wait-timeout 120
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Para vaciar el evento, reemplazar `--borrar-usuario 42` por `--borrar-contenido`, revisar la
vista previa y confirmar con `--si`. Si falla el comando, revisar el error y la integridad
antes de volver a abrir el servicio. Nunca borrar el volumen para resolver ese fallo.

El borrado repara los contadores de palabras en la misma transacción e incrementa una
revisión persistente que invalida el ranking del proceso vivo, incluso desde otra conexión.
El mantenimiento con reinicio sigue siendo obligatorio para cerrar sockets y limpiar las
vistas anteriores. Después, comprobar que notas, respuestas, búsqueda y `/api/words/top`
ya no contienen el material retirado; moderadores y asistentes deben recargar la página.
Anonimizar IP y consultar `--resumen` no requieren detener el servicio.

## 11. Revisión antes del evento

Confirmar con la Célula las actualizaciones semanales y urgentes, el monitoreo externo
de CPU/RAM/disco/red y la rotación de logs en un máximo de 365 días. El límite Docker
de cinco archivos de 10 MB evita crecimiento sin límite, pero no fija una antigüedad máxima.

- [ ] `docker compose ps` dice **healthy**.
- [ ] La página abre por HTTPS desde fuera de la universidad, en computador y en celular.
- [ ] WebSocket permanece conectado y completa publicación, respuestas y moderación.
- [ ] El respaldo HTTP long-polling se ensayó deliberadamente con el proxy y carga reales
      según la sección 3; no basta con asumir que funcionará si falla WebSocket.
- [ ] Un pin publicado desde un teléfono aparece en otro navegador sin recargar.
- [ ] `/moderador` acepta el nombre y la clave de cada moderador.
- [ ] Una palabra prohibida se rechaza y el mensaje de error se entiende.
- [ ] La exportación CSV se abre bien en Excel (tildes incluidas).
- [ ] Hay un respaldo hecho y probado (sección 5).
- [ ] El mapa quedó congelado: **no cambiar `campus.json` una vez que existan pines reales**,
      porque las coordenadas de los pines quedan referidas a ese plano.
