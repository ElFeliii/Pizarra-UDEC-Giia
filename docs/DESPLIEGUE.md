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
  La medición histórica con 600 personas alcanzó 80 MB y picos de 0,3 de un núcleo; no
  reemplaza un ensayo de la versión actual. La imagen ronda los 430 MB.
- Unos 2 GB de disco para la imagen y la base de datos.
- Un subdominio con HTTPS (por ejemplo `pizarra.giia.udec.cl`) apuntando a un proxy (Nginx/Apache)
  que reenvíe al contenedor. El proxy **debe permitir WebSocket** (ver abajo).

### Qué pedirle a quien administra el servidor

Incluir en el ticket oficial de GIIA:

1. **Docker y `docker compose`** disponibles para la cuenta personal autorizada, con los
   permisos que la Célula asigne para proyectos aprobados; no compartir cuentas o claves SSH.
2. **Salida a internet durante la construcción de la imagen**: `docker build` descarga la
   imagen base `node:22-slim` y las dependencias desde npm. Si el servidor está aislado, ver la
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
están en el código: el repositorio es privado y las claves se entregan por un canal separado.

```bash
cp .env.example .env
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
docker compose up -d --build
```

Lo demás se resuelve solo: el secreto que firma las sesiones se genera y se guarda en
`data/session-secret` (sobrevive a los reinicios), y `TRUST_PROXY=1` corresponde al despliegue con un único proxy HTTPS y el puerto Docker
publicado solo en localhost. El salto Docker puede llegar desde una IP de puente, no desde
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

Solo si quieres cambiar algo de lo anterior: copia `.env.example` a `.env`, edita lo que
corresponda y `docker compose up -d`.

| Variable            | Qué poner                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUERTO_PUBLICADO`  | Puerto del servidor asignado por GIIA, publicado solo en localhost; por defecto `3000`.                                                                                                                                               |
| `MOD_USERS`         | **Obligatoria.** Moderadores del panel `/moderador`, como `nombre:clave` separados por coma. Sin esto (o sin `MOD_PASSWORD`) el servidor no arranca.                                                                                  |
| `MOD_PASSWORD`      | Llave maestra opcional: sirve con cualquier nombre (mínimo 8 caracteres). Déjala vacía si no la necesitas.                                                                                                                            |
| `SESSION_SECRET`    | Solo si prefieres fijarlo tú (32+ caracteres aleatorios). Si se deja vacía, el servidor genera uno y lo guarda en `data/session-secret`.                                                                                              |
| `TRUST_PROXY`       | El código usa `loopback` por omisión; para Docker detrás de un único proxy local usar `1` con el puerto limitado a localhost. Con otra topología, confirmar las IP o los saltos con el administrador. `false` si se prueba sin proxy. |
| `AUTO_HIDE_REPORTS` | Reportes de usuarios distintos que ocultan un contenido automáticamente (por defecto `3`, `0` desactiva).                                                                                                                             |

> **Sobre las claves de los moderadores.** No están en el repositorio ni en la imagen: viven
> solo en el `.env` del servidor. Si son cortas, para poder dictarlas en el momento, lo único
> que frena la fuerza bruta es el límite de intentos: cinco seguidos y después uno por minuto
> desde esa IP. Alcanza para un evento de unas horas; si la pizarra va a quedar publicada
> después, usa claves largas.
>
> El nombre se puede escribir con o sin espacios y en cualquier combinación de mayúsculas:
> "Moderador 1", "moderador 1" y "moderador1" son el mismo.

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

```nginx
server {
    listen 443 ssl http2;
    server_name pizarra.giia.udec.cl;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 75s;
    }
}
```

### Apache (con `mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel`, `mod_rewrite`)

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

Si el proxy no permite WebSocket, la aplicación igual funciona (cae a _long-polling_), pero
con más carga para el servidor.

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

En GIIA, la Célula programa respaldos al final de cada mes según la regla 3-2-1, incluyendo
configuraciones y volúmenes. Proteger también `.env` y `data/session-secret`. Los comandos
siguientes permiten obtener una copia de SQLite; no crean por sí solos la programación
mensual, los destinos externos ni las tres copias requeridas. Ensayar la restauración.

- **Exportar a Excel:** panel de moderación → _Exportar_ (pines, respuestas y asistentes en CSV).
- **Respaldo completo** (en caliente, sin detener):

  ```bash
  docker compose exec pizarra node -e "require('better-sqlite3')('/app/data/pizarra.db').backup('/app/data/respaldo.db').then(()=>console.log('ok'))"
  cp data/respaldo.db ~/respaldos/pizarra-$(date +%F-%H%M).db
  ```

- O detener y copiar: `docker compose stop && cp -r data ~/respaldos/ && docker compose start`.

## 6. Actualizar

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
curl --fail "http://$(docker compose port pizarra 3000)/api/health"
```

Tras la sustitución inicial del historial publicado por la entrega saneada (ver
[ENTREGA.md](ENTREGA.md#una-vez-pasar-desde-la-primera-publicación-a-la-entrega-saneada)),
estas actualizaciones requieren que la copia publicada conserve su propio historial limpio.
No reemplazarlo con un push forzado de un nuevo commit raíz: eso impide el siguiente
`git pull --ff-only`. El historial local de desarrollo no se publica.

Si la copia instalada proviene de un historial ya reemplazado, detenerse y conservar `.env`
y `data/` en un respaldo antes de preparar un clon nuevo; no usar `reset --hard` sobre una
instalación con cambios sin revisar. `--build` es necesario para incorporar el código nuevo:
`docker compose up -d` por sí solo puede reutilizar una imagen anterior.

Los datos en `data/` se conservan. Las migraciones de la base de datos se aplican solas al arrancar.

## 7. Reiniciar la pizarra para otro evento

Detener, mover `data/pizarra.db*` a un respaldo y volver a levantar: se crea una base vacía
con la lista de palabras semilla.

```bash
docker compose stop
mkdir -p ~/respaldos && mv data/pizarra.db* ~/respaldos/
docker compose start
```

## 8. Otros entornos: Node directo

**Esta opción no se admite para el levantamiento en GIIA**, donde Docker y Compose son
obligatorios. En otro entorno autorizado, el mismo servidor puede ejecutarse con **Node 22
o superior**:

```bash
npm ci
npm run build
cp .env.example .env     # completar MOD_USERS; ajustar TRUST_PROXY a la topología
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

La base de datos queda en `data/pizarra.db` dentro del proyecto (o donde apunte `DB_PATH`).

## 9. Si el servidor no tiene salida a internet

Construir la imagen en un computador que sí la tenga y llevarla en un archivo:

```bash
# En el computador con internet
docker build -t pizarra-udec:latest .
docker save pizarra-udec:latest | gzip > pizarra-udec.tar.gz

# En el servidor
gunzip -c pizarra-udec.tar.gz | docker load
docker compose up -d          # usa la imagen ya cargada
```

Para que `docker compose` no intente reconstruir, comentar la línea `build: .` en
`docker-compose.yml` mientras se use la imagen importada.

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

Estas operaciones no están en el panel web a propósito. Las claves de los moderadores son
cortas, y un panel con un botón de "borrar todo" es demasiado riesgo para lo que aporta.

## 11. Revisión antes del evento

Confirmar con la Célula las actualizaciones semanales y urgentes, el monitoreo externo
de CPU/RAM/disco/red y la rotación de logs en un máximo de 365 días. El límite Docker
de cinco archivos de 10 MB evita crecimiento sin límite, pero no fija una antigüedad máxima.

- [ ] `docker compose ps` dice **healthy**.
- [ ] La página abre por HTTPS desde fuera de la universidad, en computador y en celular.
- [ ] En la consola del navegador no aparece el aviso de que el WebSocket falló
      (si cae a _long-polling_ igual funciona, pero con más carga).
- [ ] Un pin publicado desde un teléfono aparece en otro navegador sin recargar.
- [ ] `/moderador` acepta el nombre y la clave de cada moderador.
- [ ] Una palabra prohibida se rechaza y el mensaje de error se entiende.
- [ ] La exportación CSV se abre bien en Excel (tildes incluidas).
- [ ] Hay un respaldo hecho y probado (sección 5).
- [ ] El mapa quedó congelado: **no cambiar `campus.json` una vez que existan pines reales**,
      porque las coordenadas de los pines quedan referidas a ese plano.
