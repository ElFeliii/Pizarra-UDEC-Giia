# Pizarra UdeC — Plano del proyecto (Parte A+B: núcleo de pines + vista pizarra)

> Estado: **implementado** (partes A y B). Las diferencias entre este plano y lo construido
> están anotadas en su lugar (límites, nivel de detalle, radio, migraciones, E2E).

## Contexto

Sitio web para un **evento puntual de la Universidad de Concepción** con alto tráfico, alojado en un servidor de la UdeC que admite **Docker**. Los asistentes (estudiantes de colegios y universidades, mayoritariamente en **celular**) entran con **nombre + institución** y ponen **pines de colores** en una **pizarra gigante compartida en tiempo real**. Cada pin lleva una nota; otros responden en un hilo con historial; el pin **crece según sus respuestas**. Hay **búsqueda**, **palabras más repetidas** y **censura** (filtro de palabras + límites anti-spam + moderación humana esporádica, con auto-ocultado por 3 reportes). La institución sirve para saber **de dónde vienen** los asistentes (estadística exportable).

Una segunda parte futura (C) será un **mapa vectorial de la UdeC** con fichas de edificios/fotos y la misma capa de pines activable/desactivable. Esta parte NO se construye ahora, pero el núcleo se diseña para soportarla sin reescritura (pines anclados a una `surface`, render en SVG con el mismo sistema de coordenadas).

**Restricción del proyecto:** todo vive dentro de esta carpeta; no depende de nada externo ni toca nada fuera de ella.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Despliegue | Un contenedor Docker (`docker compose up`) en servidor UdeC, detrás de su proxy HTTPS |
| Stack | Node 22 LTS + TypeScript · Fastify 5 + Socket.IO 4 · SQLite (better-sqlite3, WAL) · React 19 + Vite · d3-zoom · zustand · zod |
| Identidad | Nombre + institución, sin contraseña. Nombre pasa por censura. Suplantación tolerada si no es ofensiva |
| Instituciones | Lista editable en JSON (colegios + universidades). Semilla: "Colegio ejemplo 1", "Universidad ejemplo 1" + opción "Otra" (texto libre, censurado) |
| Estilo visual | **Blanco minimalista** con cuadrícula suave; chinches circulares con brillo/sombra |
| Pizarra | Lienzo grande (8000×8000 u.) con zoom y desplazamiento (mouse, rueda, dedos/pinch) |
| Edición | El autor NO edita ni borra; solo el moderador oculta/restaura |
| Censura | (1) filtro de palabras normalizado, (3) moderación humana, (4) límites anti-spam. Sin IA |
| Auto-ocultar | 3 reportes de usuarios distintos → oculto y a cola de revisión (configurable) |
| Moderador | Login dentro de la misma página (`/moderador`), contraseña en variable de entorno |
| Datos post-evento | Se conservan; exportación CSV (compatible con Excel) |
| Idioma / zona | Español · `America/Santiago` |

## Estructura de carpetas (monorepo con npm workspaces)

```
Pizarra Udec/
├─ package.json              # workspaces: shared, server, client; scripts dev/build/test
├─ tsconfig.base.json
├─ Dockerfile                # multi-stage: build client+server → runtime node:22-slim
├─ docker-compose.yml        # servicio "pizarra", volumen ./data, env_file .env, healthcheck
├─ .env.example              # PORT, MOD_PASSWORD, SESSION_SECRET, DB_PATH, TRUST_PROXY, AUTO_HIDE_REPORTS
├─ .gitignore / .dockerignore
├─ docs/
│  ├─ diseno.md              # copia de este plano (spec)
│  └─ DESPLIEGUE.md          # guía servidor UdeC + snippet Nginx/Apache para WebSocket
├─ shared/src/
│  ├─ constants.ts           # COLORES, LÍMITES, BOARD_SIZE, pinRadius(), SURFACES
│  ├─ schemas.ts             # zod: SessionInput, PinInput, ReplyInput, ReportInput
│  └─ events.ts              # tipos de eventos Socket.IO (cliente↔servidor)
├─ server/
│  ├─ data/instituciones.json
│  ├─ src/
│  │  ├─ index.ts            # arranque: config → db → fastify → socket.io
│  │  ├─ config.ts           # lee/valida env con zod
│  │  ├─ db/
│  │  │  ├─ schema.ts        # migraciones (tablas + índices + FTS5), versionadas por user_version
│  │  │  ├─ db.ts            # conexión, pragmas, migración por user_version
│  │  │  └─ repos/           # users.ts, pins.ts, replies.ts, reports.ts, words.ts, modlog.ts
│  │  ├─ moderation/
│  │  │  ├─ normalize.ts     # pipeline de normalización (ver Censura)
│  │  │  ├─ censor.ts        # matcher compilado en memoria, reconstruible en caliente
│  │  │  ├─ wordlist.default.ts # semilla de palabras (Chile + español general)
│  │  │  ├─ contentRules.ts  # largo, URLs, saltos de línea, caracteres invisibles
│  │  │  └─ rateLimit.ts     # token bucket por sesión y por IP
│  │  ├─ stats/
│  │  │  ├─ topWords.ts      # tokenizador + contador incremental + cache top N
│  │  │  └─ stopwords.es.ts
│  │  ├─ services/
│  │  │  ├─ content.ts       # crear pin/respuesta: validar→censurar→limitar→guardar→emitir
│  │  │  └─ moderation.ts    # ocultar/restaurar, silenciar, reportes, auto-ocultado
│  │  ├─ realtime/socket.ts  # auth handshake, handlers, salas, emisión por lotes
│  │  └─ http/
│  │     ├─ public.ts        # rutas públicas
│  │     ├─ admin.ts         # rutas de moderador
│  │     └─ auth.ts          # login moderador, cookie firmada, guard
│  └─ test/                  # unit + integración (Vitest + socket.io-client)
├─ client/
│  ├─ index.html
│  └─ src/
│     ├─ main.tsx, App.tsx   # enrutado mínimo por pathname: / y /moderador
│     ├─ api/                # http.ts (fetch tipado), socket.ts (conexión + reconexión)
│     ├─ state/store.ts      # zustand: sesión, pines (Map), hilo abierto, filtros
│     ├─ screens/
│     │  ├─ Entrada.tsx      # nombre + institución (combobox con búsqueda)
│     │  ├─ Pizarra.tsx      # layout: canvas + barra de herramientas + paneles
│     │  └─ Moderador.tsx    # login + panel con pestañas
│     ├─ board/
│     │  ├─ Canvas.tsx       # <svg> + d3-zoom, fondo cuadriculado (pattern)
│     │  ├─ PinLayer.tsx     # culling por viewport + nivel de detalle + orden por radio
│     │  ├─ Pin.tsx          # chinche memoizada
│     │  └─ Placement.tsx    # modo "poner pin": mira central + "Poner aquí"
│     ├─ thread/ThreadPanel.tsx   # panel lateral (desktop) / hoja inferior (móvil)
│     ├─ search/SearchBar.tsx, TopWords.tsx
│     ├─ moderation/         # ReportQueue, LiveFeed, WordList, Users, Stats, Export
│     └─ styles/             # CSS con variables (tokens), sin framework pesado
└─ scripts/loadtest.ts       # N clientes simulados con socket.io-client
```

## Modelo de datos (SQLite)

Pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`. Todas las consultas con sentencias preparadas. Tiempos en epoch ms.

```sql
users(id PK, token_hash TEXT UNIQUE, name, institution_id, institution_name,
      ip, created_at, silenced_at NULL)
pins(id PK, surface TEXT DEFAULT 'board', x REAL, y REAL, color, text,
     user_id FK, reply_count INT DEFAULT 0,
     hidden_at NULL, hidden_by NULL, hidden_reason NULL,  -- 'mod' | 'reports'
     created_at, updated_at)
     INDEX (surface, updated_at)
replies(id PK, pin_id FK, text, user_id FK, hidden_at, hidden_by, hidden_reason, created_at)
     INDEX (pin_id, created_at)
reports(id PK, target_type CHECK('pin','reply'), target_id, user_id, reason NULL,
        created_at, resolved_at NULL, resolved_by NULL,
        UNIQUE(target_type, target_id, user_id))           -- 1 reporte por usuario
banned_words(id PK, term UNIQUE, mode CHECK('exact','prefix','contains'), created_by, created_at)
word_counts(word PK, count INT) WITHOUT ROWID
mod_log(id PK, moderator, action, target_type, target_id, detail, created_at)
content_fts USING fts5(text, author, institution, kind UNINDEXED, ref_id UNINDEXED,
                       pin_id UNINDEXED, tokenize='unicode61 remove_diacritics 2')
```

- `token_hash` = SHA-256 del token de sesión (el token en claro solo vive en el `localStorage` del usuario).
- Ocultar = soft-delete (`hidden_at`); nunca se borra, se puede restaurar.
- `reply_count` desnormalizado (solo respuestas visibles), actualizado en la misma transacción.
- `updated_at` permite **sincronización incremental** al reconectar.
- `surface` deja listo el mapa (Parte C).

## Crecimiento del pin

`pinRadius(n) = min(48, 12 + 5·√n)` en unidades del lienzo (en `shared/constants.ts`, lo usan cliente y servidor).
n=0→12 · 1→17 · 4→22 · 9→27 · 25→37 · 36→42 · ≥52→48 (tope). La raíz evita que un pin popular tape la pizarra. Se dibujan primero los grandes para que los pequeños queden encima y clicables.

## Censura y anti-abuso (lo crítico)

### Pipeline de normalización (`normalize.ts`)
1. Quitar caracteres invisibles/de control (zero-width, bidi, etc.) y limitar saltos de línea (máx. 2 seguidos).
2. Minúsculas + NFD + quitar tildes, **preservando `ñ`** (así "coño" ≠ "cono").
3. Leetspeak: `0→o 1→i 3→e 4→a 5→s 7→t @→a $→s !→i`.
4. Colapsar letras repetidas (`weoooon→weon`). La lista de palabras se normaliza con el mismo pipeline, así la comparación es consistente.
5. Tokenizar por no-letras. Además: unir secuencias de letras sueltas (`w e o n`, `c.t.m` → `weon`, `ctm`) y una versión **sin separadores** del mensaje completo.

### Matching por modo (evita falsos positivos tipo "computadora")
- `exact`: el token completo coincide (`ctm`, `csm`).
- `prefix`: el token empieza con el término (`puta` → puta, putas, putamadre; **no** "disputa", "computadora").
- `contains`: subcadena en cualquier token y en la versión sin separadores. Solo para raíces inequívocas (`weon`, `culia`, `conchetumadre`).
- Palabras ambiguas en Chile ("pico", "paja", "raja") **no van en la semilla**: se cubren con reportes y moderador.
- La semilla trae **261 términos**: groserías chilenas e internacionales, insultos, contenido sexual explícito, homofobia, racismo, xenofobia, supremacismo y amenazas. Incluye **24 frases** de varias palabras ("sieg heil", "te voy a matar"), que se buscan como secuencia de palabras seguidas.
- La semilla está versionada: al subir `WORDLIST_VERSION` las bases que ya existen reciben los términos nuevos sin perder lo que el moderador agregó.
- Se carga a `banned_words` y luego el moderador la edita en vivo (el matcher se recompila en memoria al instante).
- Se aplica a: texto de pin, texto de respuesta, **nombre** e institución "Otra".
- Al rechazar: mensaje genérico ("Tu mensaje contiene palabras no permitidas") sin revelar cuál.
- Botón para el moderador al agregar palabra: **"Ocultar contenido existente que la contenga"** (aplicación retroactiva usando FTS).

### Reglas de contenido (`contentRules.ts`)
- Largos: nombre 2–40 · pin 1–280 · respuesta 1–500 · motivo de reporte 0–200.
- Bloqueo de links (`http`, `www.`, patrón `dominio.tld`), emails y teléfonos (evita datos personales).
- Mismo texto de la misma sesión en <10 min → rechazado (anti-duplicado).

### Límites anti-spam (`rateLimit.ts`, token bucket en memoria)
- Por sesión: pines 2 de ráfaga, 1 cada 30 s · respuestas 3 de ráfaga, 1 cada 5 s · reportes 10 cada 10 min. Solo cuenta lo que se publica.
- Rechazos del filtro: 6 seguidos por usuario, luego 1 cada 10 s (frena a quien prueba variantes sin castigar al que corrige su mensaje).
- Creación de sesiones: solo por IP, 60 de ráfaga y 1/s (no hay sesión todavía y el WiFi del evento comparte IP).
- Por IP: límites **generosos** (≈20× los de sesión), porque en el evento muchos comparten el WiFi/NAT de la UdeC.
- Login de moderador: 5 intentos/min por IP.
- Socket.IO `maxHttpBufferSize` = 16 KB.

### Moderación humana
- **Silenciar** usuario: puede leer, no publicar (`silenced_at`). Recibe aviso. (Evadible borrando localStorage; aceptable, el moderador lo vuelve a silenciar.)
- **Auto-ocultado**: 3 reportes de usuarios distintos → `hidden_reason='reports'`, entra a la cola; el moderador **restaura** o **confirma**. Umbral en `AUTO_HIDE_REPORTS`.
- Todas las acciones van a `mod_log` con el nombre del moderador.

## Protocolo en tiempo real (Socket.IO)

Handshake con `auth: { token }`. Escrituras por socket con **ack** (`{ok:true,data}` | `{ok:false,error:{code,message}}`).

| Dirección | Evento | Payload / notas |
|---|---|---|
| C→S | `pin:create` | `{surface,x,y,color,text}` |
| C→S | `reply:create` | `{pinId,text}` |
| C→S | `report:create` | `{targetType,targetId,reason?}` |
| C→S | `thread:join` / `thread:leave` | `{pinId}` → entra/sale de la sala `pin:<id>` |
| S→todos | `pin:created` | resumen del pin |
| S→todos | `pins:updated` | **lote** `[{id,replyCount}]` emitido cada 500 ms si hubo cambios |
| S→todos | `pin:removed` / `pin:restored` | ocultado / restaurado |
| S→sala | `reply:created` / `reply:removed` | solo a quienes tienen el hilo abierto |
| S→todos | `words:top` | top 20, máx. cada 10 s y solo si cambió |
| S→todos | `presence:count` | "N conectados", máx. cada 5 s |
| S→usuario | `session:silenced` | |
| S→mods | `mod:feed`, `mod:report` | sala `mods`: todo lo publicado y cada reporte, en vivo |

Optimización clave: la carga inicial manda solo **resúmenes** (id, x, y, color, replyCount, preview de 80 caracteres, autor, institución, fecha); el hilo completo se pide al abrir el pin. Reconexión: `GET /api/pins?since=<updatedAt>` trae solo lo cambiado (incluye ocultados). Compresión HTTP activada.

## API HTTP

Públicas: `GET /api/health` · `GET /api/institutions` · `POST /api/session` → `{token, user}` · `GET /api/pins?surface=board[&since=]` · `GET /api/pins/:id/thread` · `GET /api/search?q=` (FTS5, devuelve pinIds + snippets) · `GET /api/words/top`.

Moderador (cookie httpOnly firmada, SameSite=Strict, 8 h, sesiones en memoria): `POST /api/admin/login {password, moderatorName}` · `POST /api/admin/logout` · `GET /api/admin/me` · `GET /api/admin/reports` · `GET /api/admin/feed` · `POST /api/admin/content/:type/:id/{hide|restore}` · `POST /api/admin/users/:id/{silence|unsilence}` · `GET|POST|DELETE /api/admin/words` · `POST /api/admin/words/:id/apply` · `GET /api/admin/stats` · `GET /api/admin/export/{pins|replies|users}.csv` (UTF-8 con BOM para que Excel respete tildes).

Seguridad transversal: validación zod en todo input · `@fastify/helmet` con CSP estricta · React escapa texto (prohibido `dangerouslySetInnerHTML`) · comparación de contraseña en tiempo constante · `trustProxy` configurable para leer la IP real detrás del proxy UdeC.

## Búsqueda y palabras más repetidas

- **Búsqueda**: barra con debounce de 300 ms → `/api/search`. Busca en texto de pines y respuestas, autor e institución, sin importar tildes. Resultados en lista; al tocar uno la cámara **vuela al pin** (transición d3-zoom) y abre su hilo. En la pizarra, los pines que coinciden se resaltan y el resto se atenúa.
- **Palabras más repetidas**: al guardar contenido visible se tokeniza, se quitan stopwords (≈300 del español + "jaja", "xd", etc.), palabras <3 letras y prohibidas, y se incrementa `word_counts` en la misma transacción (al ocultar, se decrementa). El top 20 vive en caché en memoria. Panel con "chips" de tamaño proporcional a la frecuencia; tocar una palabra = buscarla.

## Interfaz (cliente)

- **Entrada**: tarjeta centrada: nombre + combobox de institución con búsqueda (lista larga) + "Otra". Validación en vivo. La sesión se guarda en `localStorage`; "Cambiar nombre" en el menú crea una sesión nueva.
- **Pizarra**: fondo blanco con cuadrícula suave (SVG `pattern`, barato). Zoom de 0,1× a 4×. Botón "Centrar". Contador "N conectados".
- **Nivel de detalle**: zoom <0,4 → puntos de color · 0,4–0,9 → chinche + insignia con n° de respuestas · ≥0,9 → chinche + etiqueta con el preview (la vista inicial es 1, así que al entrar ya se leen las notas; al encuadrar se usa zoom mínimo 0,5).
- **Culling**: solo se renderizan los pines dentro del viewport (+ margen), recalculado por `requestAnimationFrame` al mover. `Pin` memoizado. Los pines nuevos de otros pulsan 3 s.
- **Poner pin (pensado para celular)**: botón "+" → elegir color (8: rojo, naranjo, amarillo, verde, celeste, azul, morado, rosado; validados en el servidor) → aparece una **mira fija al centro**, el usuario mueve la pizarra hasta el lugar y toca "Poner aquí" (en desktop también sirve un clic directo) → redactar → "Publicar". Estado "enviando" hasta el ack; si es rechazado, se muestra el motivo sin perder el texto.
- **Hilo**: panel lateral (≥768 px) u hoja inferior (móvil). Nota original, autor · institución · "hace X min" (`Intl.RelativeTimeFormat` es-CL), respuestas en orden cronológico que llegan en vivo, caja de respuesta y botón "Reportar" en cada elemento.
- **Barra inferior (móvil) / superior (desktop)**: [+ Pin] [Buscar] [Palabras] [Menú].
- Si hay un moderador logueado, el hilo muestra además botones **Ocultar / Silenciar** directamente en la pizarra.

## Panel de moderador (`/moderador`)

Login (contraseña + nombre del moderador). Pestañas: **Revisión** (auto-ocultados + reportes pendientes: restaurar/confirmar) · **En vivo** (feed en tiempo real de todo lo publicado, con ocultar en un clic) · **Palabras** (lista, agregar con modo, eliminar, aplicar retroactivo) · **Usuarios** (buscar, silenciar/des-silenciar) · **Estadísticas** (asistentes por institución, pines, respuestas; gráfico de barras simple) · **Exportar** (3 CSV).

## Docker y despliegue

- `Dockerfile` multi-stage: etapa build (instala dependencias con toolchain para better-sqlite3, `vite build` + `tsc`) → etapa runtime `node:22-slim` sin devDependencies, usuario no-root, `NODE_ENV=production`.
- `docker-compose.yml`: puerto `3000`, volumen `./data:/app/data` (SQLite persistente), `restart: unless-stopped`, healthcheck a `/api/health`.
- `docs/DESPLIEGUE.md`: pasos en el servidor UdeC, variables de entorno, snippet de proxy con `Upgrade`/`Connection` para WebSocket, respaldo (`sqlite3 .backup` o copiar `data/` con el contenedor detenido), recomendación mínima 1 vCPU / 1 GB RAM (un proceso Node + SQLite WAL soporta miles de conexiones y escrituras para esta escala).

## Fases de implementación (en orden)

0. **Base**: `git init` dentro de la carpeta, workspaces, TS, ESLint + Prettier, `.gitignore`, copiar este plano a `docs/diseno.md`.
1. **shared**: constantes, `pinRadius`, schemas zod, tipos de eventos.
2. **Servidor – datos**: config, db + migración, repos. Tests de repos con SQLite `:memory:`.
3. **Servidor – moderación**: normalize, censor, contentRules, rateLimit, semilla de palabras. **Tests primero** con una tabla de casos.
4. **Servidor – tiempo real + API pública**: `services/content.ts`, socket, rutas. Tests de integración.
5. **Búsqueda + top palabras** (FTS5, contador incremental). Tests.
6. **Cliente – Entrada**.
7. **Cliente – Canvas**: d3-zoom, cuadrícula, capa de pines, LOD, culling.
8. **Cliente – Poner pin + Hilo + store en tiempo real + reconexión incremental**.
9. **Cliente – Búsqueda + Palabras**.
10. **Moderador**: auth, rutas admin, panel, acciones en línea, auto-ocultado, exportación CSV.
11. **Docker + DESPLIEGUE.md + prueba de carga**.
12. **Pulido**: animaciones, estados vacíos/errores, accesibilidad (aria-labels, contraste, foco), prueba en celular real.

Commits al cierre de cada fase.

## Preparado para la Parte C (mapa), sin construirlo ahora

`surface` en pines y en la API, `Canvas` recibe el fondo como hijo (la cuadrícula hoy, el SVG del mapa mañana), y la capa de pines es un componente independiente que se puede ocultar. Las fichas de edificios y fotos serán un módulo aparte.

## Verificación

- **Unit (Vitest)**: tabla de censura — bloquea `weon`, `w3on`, `weoooon`, `w.e.o.n`, `w e o n`, `ctm`, `c.t.m`, texto con zero-width; **no** bloquea "computadora", "disputa", "cono", "a las 3 y pico". También rate limiter (ráfaga/recarga), `pinRadius`, tokenizador de top palabras y regex de links/emails/teléfonos.
- **Integración** (servidor en puerto aleatorio + DB `:memory:` + 2 clientes socket.io-client): crear sesión → el cliente A crea un pin → B recibe `pin:created`; responder → `pins:updated` con el nuevo count; palabra prohibida → ack de error; usuario silenciado → rechazado; 3 reportes distintos → `pin:removed` y aparece en la cola; rutas admin sin cookie → 401; export CSV con BOM.
- **E2E**: se verificó manualmente en navegador (escritorio y celular 375 px): entrada → poner pin → llega en vivo → responder → el radio crece → buscar lo encuentra → el moderador lo oculta. Los flujos multi-cliente están cubiertos por las pruebas de integración con varios sockets (no se agregó Playwright para no descargar navegadores fuera del proyecto).
- **Carga**: `scripts/loadtest.ts` con 500–1000 clientes conectados, publicando a ritmo realista; medir latencia de difusión (objetivo p95 < 300 ms en LAN) y memoria del contenedor.
- **Manual**: `docker compose up --build` → abrir `http://localhost:3000` en PC y en el celular (IP de la LAN) y probar gestos, poner pin con la mira y el panel `/moderador`.
