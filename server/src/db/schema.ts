/**
 * Migraciones en orden. La posición en el arreglo es la versión (PRAGMA user_version).
 * Nunca editar una migración ya publicada: agregar una nueva al final.
 */
export const MIGRATIONS: string[] = [
  /* v1 */ `
  CREATE TABLE users (
    id               INTEGER PRIMARY KEY,
    token_hash       TEXT    NOT NULL UNIQUE,
    name             TEXT    NOT NULL,
    institution_id   TEXT    NOT NULL,
    institution_name TEXT    NOT NULL,
    ip               TEXT,
    created_at       INTEGER NOT NULL,
    silenced_at      INTEGER
  );
  CREATE INDEX users_institution ON users(institution_name);

  CREATE TABLE pins (
    id            INTEGER PRIMARY KEY,
    surface       TEXT    NOT NULL DEFAULT 'board',
    x             REAL    NOT NULL,
    y             REAL    NOT NULL,
    color         TEXT    NOT NULL,
    text          TEXT    NOT NULL,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    reply_count   INTEGER NOT NULL DEFAULT 0,
    hidden_at     INTEGER,
    hidden_by     TEXT,
    hidden_reason TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX pins_surface_updated ON pins(surface, updated_at);
  CREATE INDEX pins_user ON pins(user_id, created_at);

  CREATE TABLE replies (
    id            INTEGER PRIMARY KEY,
    pin_id        INTEGER NOT NULL REFERENCES pins(id),
    text          TEXT    NOT NULL,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    hidden_at     INTEGER,
    hidden_by     TEXT,
    hidden_reason TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX replies_pin ON replies(pin_id, created_at);
  CREATE INDEX replies_user ON replies(user_id, created_at);

  CREATE TABLE reports (
    id          INTEGER PRIMARY KEY,
    target_type TEXT    NOT NULL CHECK (target_type IN ('pin', 'reply')),
    target_id   INTEGER NOT NULL,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    reason      TEXT,
    created_at  INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT,
    UNIQUE (target_type, target_id, user_id)
  );
  CREATE INDEX reports_open ON reports(resolved_at, target_type, target_id);

  CREATE TABLE banned_words (
    id         INTEGER PRIMARY KEY,
    term       TEXT    NOT NULL,
    mode       TEXT    NOT NULL CHECK (mode IN ('exact', 'prefix', 'contains')),
    created_by TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (term, mode)
  );

  CREATE TABLE word_counts (
    word    TEXT    PRIMARY KEY,
    display TEXT    NOT NULL,
    count   INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX word_counts_count ON word_counts(count);

  CREATE TABLE mod_log (
    id          INTEGER PRIMARY KEY,
    moderator   TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    target_type TEXT,
    target_id   INTEGER,
    detail      TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;

  CREATE VIRTUAL TABLE content_fts USING fts5(
    text, author, institution,
    kind UNINDEXED, ref_id UNINDEXED, pin_id UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  `,

  /* v2: secciones. Cada parte de la página se abre o se cierra por separado, que es como se
     pasa del momento de los universitarios al de puertas abiertas. */ `
  CREATE TABLE secciones (
    id         TEXT    PRIMARY KEY,
    tipo       TEXT    NOT NULL CHECK (tipo IN ('lienzo', 'muro', 'encuesta')),
    nombre     TEXT    NOT NULL,
    orden      INTEGER NOT NULL,
    estado     TEXT    NOT NULL CHECK (estado IN ('abierta', 'solo_lectura', 'oculta')),
    updated_at INTEGER NOT NULL
  );

  -- Las dos secciones que ya existen como superficies tienen que estar antes de rellenar
  -- los pines: si no, la clave foránea rechaza el relleno en cualquier base con datos.
  -- El resto del catálogo lo agrega la semilla, que no pisa lo que ya esté.
  INSERT INTO secciones (id, tipo, nombre, orden, estado, updated_at) VALUES
    ('mapa',    'lienzo', 'Mapa',    1, 'abierta', 0),
    ('pizarra', 'lienzo', 'Pizarra', 2, 'abierta', 0);

  ALTER TABLE pins ADD COLUMN seccion_id TEXT REFERENCES secciones(id);
  UPDATE pins SET seccion_id = CASE surface WHEN 'map' THEN 'mapa' ELSE 'pizarra' END;
  CREATE INDEX pins_seccion ON pins(seccion_id, updated_at);
  `,

  /* v3: visitas y colores con significado. Cada persona cuenta una sola vez por nota, y los
     cuatro colores que se eliminaron pasan a verde, que es el de mensaje simple. */ `
  ALTER TABLE pins ADD COLUMN vistas INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE pin_vistas (
    pin_id     INTEGER NOT NULL REFERENCES pins(id),
    visitante  TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (pin_id, visitante)
  ) WITHOUT ROWID;

  UPDATE pins SET color = 'verde'
   WHERE color NOT IN ('verde', 'rojo', 'azul', 'morado');
  `,
  /* v4: Carreras y FAQ comparten las notas existentes, agrupadas por tema. El campus
     distingue ofertas que tienen el mismo nombre y pertenecen a unidades diferentes. */ `
  CREATE TABLE temas (
    id TEXT PRIMARY KEY,
    seccion_id TEXT NOT NULL REFERENCES secciones(id),
    nombre TEXT NOT NULL,
    grupo TEXT,
    campus TEXT,
    orden INTEGER NOT NULL,
    oculto INTEGER NOT NULL DEFAULT 0 CHECK (oculto IN (0, 1))
  );
  CREATE INDEX temas_seccion ON temas(seccion_id, orden);
  ALTER TABLE pins ADD COLUMN tema_id TEXT REFERENCES temas(id);
  CREATE INDEX pins_tema ON pins(tema_id, updated_at);
  `,
  /* v5: la firma se guarda al publicar, solo desde una sesión de moderador verificada.
     Las notas anteriores no se atribuyen por nombre: ese dato nunca autenticó a nadie. */ `
  ALTER TABLE pins ADD COLUMN autor_moderador TEXT;
  ALTER TABLE replies ADD COLUMN autor_moderador TEXT;
  `,
];
