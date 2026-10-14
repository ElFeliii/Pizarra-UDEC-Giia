# Pizarra UdeC

Pizarra colaborativa en tiempo real para eventos de la Universidad de Concepción. Los
asistentes entran con su **nombre e institución**, ponen **pines de colores** con una nota en
una pizarra gigante compartida, y responden los pines de otros en un **hilo con historial**.
Cada pin **crece** mientras más respuestas tiene. Incluye **búsqueda**, **palabras más
repetidas** y un sistema de **censura** (filtro de palabras, límites anti-spam, reportes y
panel de moderación).

- Diseño completo: [docs/diseno.md](docs/diseno.md)
- Revisión del repositorio: [docs/PRIVACIDAD.md](docs/PRIVACIDAD.md)
- Documento principal para informática: [docs/GUIA-INFORMATICA.md](docs/GUIA-INFORMATICA.md)
- Entrega al administrador: [docs/ENTREGA.md](docs/ENTREGA.md)
- Despliegue en el servidor: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)
- Mapa del campus, del plano CAD al SVG: [docs/MAPA.md](docs/MAPA.md)
- Lista de colegios y universidades: [docs/INSTITUCIONES.md](docs/INSTITUCIONES.md)
- Carreras por campus y facultad, y preguntas frecuentes: [docs/CARRERAS.md](docs/CARRERAS.md)

## Abrirla (Windows)

Doble clic en **`abrir-pizarra.bat`**. Se levanta todo y el navegador se abre solo en
http://localhost:5173. Para detenerla, cierra esa ventana negra.

Para tenerlo a mano: clic derecho sobre el archivo → _Enviar a_ → _Escritorio (crear acceso directo)_.

La primera vez instala dependencias y puede tardar unos minutos; después arranca en segundos.

**Solo es visible en tu propio computador.** Para probarla desde el celular (mismo WiFi),
usa `npm run dev:lan` y entra desde el teléfono a `http://<IP-de-tu-PC>:5173`.

## Estructura

```
shared/   Tipos, constantes, validaciones (zod) y eventos compartidos por cliente y servidor
server/   Node + Fastify + Socket.IO + SQLite (censura, tiempo real, moderación, API)
client/   React + Vite; pizarra en SVG con d3-zoom (mouse, rueda y gestos táctiles)
scripts/  Prueba de carga
docs/     Diseño y guía de despliegue
```

## Desarrollo

Requiere Node 22 o superior.

```bash
npm install
npm run dev          # servidor en :3000 y cliente en http://localhost:5173
```

- `npm run dev` y `npm run dev:lan` activan desarrollo explícitamente con `--desarrollo`.
  Sin esa selección ni `NODE_ENV`, el servidor usa producción y exige credenciales válidas.
  Una configuración `NODE_ENV=production` no puede degradarse con la bandera de desarrollo.
- Panel de moderación: http://localhost:5173/moderador. Si no se define `MOD_USERS` en
  desarrollo, usar `Moderador 1`, `Moderador 2` o `Moderador 3` con `moderador-dev`.
  La clave maestra queda desactivada por omisión. Usar una base separada de la del evento.
- La base de datos de desarrollo queda en `data/pizarra.db` (se crea sola, está en `.gitignore`).
- Instituciones: `server/data/instituciones.json`.
- Palabras prohibidas iniciales: `server/src/moderation/wordlist.default.ts` (solo se cargan
  la primera vez; después se administran desde el panel).

## Comandos

| Comando                      | Qué hace                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run dev`                | Servidor y cliente con recarga automática (solo este computador)                                           |
| `npm run dev:lan`            | Igual, pero accesible desde la red local para probar en el celular                                         |
| `npm test`                   | Pruebas unitarias e integración (Vitest)                                                                   |
| `npm run typecheck`          | Verificación de tipos de los tres paquetes                                                                 |
| `npm run lint`               | ESLint                                                                                                     |
| `npm run build`              | Compila cliente (`client/dist`) y servidor (`server/dist`)                                                 |
| `npm start`                  | Ejecuta la versión compilada (sirve también el cliente)                                                    |
| `npm run loadtest`           | Prueba de carga contra `URL` (por defecto `http://localhost:3000`)                                         |
| `npm run carreras`           | Regenera el catálogo de carreras aprobado ([docs/CARRERAS.md](docs/CARRERAS.md))                           |
| `npm run fotos`              | Descarga las fotos de edificios con licencia libre ([docs/EDIFICIOS.md](docs/EDIFICIOS.md))                |
| `npm run datos -- --resumen` | Qué hay guardado en la base; también anonimiza IP y borra datos ([docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)) |

## Producción

Repositorio: [ElFeliii/Pizarra-UDEC-Giia](https://github.com/ElFeliii/Pizarra-UDEC-Giia).
Quien despliega comprueba acceso; si GitHub solicita autorización, tramitarla con el equipo.
En la primera instalación,
crear `.env` desde `.env.example` sólo si todavía no existe, y completar `MOD_USERS`
con las claves entregadas por el equipo. Después, editar el `.env` existente sin sobrescribirlo.

```bash
test -e .env || cp .env.example .env
chmod 600 .env
# Editar .env y preparar los permisos de data/ en Linux (ver la guía de entrega).
docker compose up -d --build --wait --wait-timeout 120
```

La página, API y WebSocket usan `127.0.0.1:<PUERTO_PUBLICADO>` detrás del proxy HTTPS;
GIIA asigna ese puerto en `.env` (3000 por defecto). El dominio público
debe terminar en `.giia.udec.cl` y lo asigna la Universidad. Compose usa `TRUST_PROXY=1`
por omisión únicamente para un proxy local y backend publicado en `127.0.0.1`; otra
cadena requiere configuración acordada con GIIA. Para probar directamente, usar `false`.

Cada clave individual requiere al menos 12 caracteres. `MOD_PASSWORD` es opcional, no
tiene valor predeterminado, exige también 12 caracteres y registra todas sus acciones como
`Emergencia`; ese nombre no puede ser una cuenta individual. Al rotar o retirar credenciales,
recrear el servicio con `docker compose up -d --force-recreate --wait --wait-timeout 120`:
las sesiones anteriores se invalidan y los moderadores vuelven a iniciar sesión.

Nginx necesita HTTP/1.1 hacia el backend, `Upgrade`/`Connection`, el origen externo y
tiempos de espera de 75 segundos. El cliente también permite HTTP long-polling, pero su
funcionamiento y carga deben comprobarse detrás del proxy real antes del evento; ver la
[aceptación de transportes](docs/DESPLIEGUE.md#comprobar-los-dos-transportes).

En GIIA el levantamiento lo realiza la Célula de Infraestructura y Seguridad, mediante
un ticket aprobado, y el proyecto se instala en `/var/src/pizarra-udec`.
Guía sencilla, recursos y pendientes administrativos: [docs/ENTREGA.md](docs/ENTREGA.md).
Proxy, operación y respaldos: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).
Dependencias de construcción y revisión de seguridad: [docs/SEGURIDAD.md](docs/SEGURIDAD.md).
