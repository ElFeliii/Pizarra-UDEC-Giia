import type { BannedWordMode, EstadoSeccion, ModContentItem } from '@pizarra/shared';
import { ESTADOS_SECCION } from '@pizarra/shared';
import { useMemo, useState } from 'react';
import { ApiError, api } from '../api/http';
import { fullDate, timeAgo, useNow } from '../lib/time';
import { useStore } from '../state/store';
import { ContentActions, REASON_LABEL, TYPE_LABEL, runAction, useLoad } from './common';

// ---------------------------------------------------------------------------
// Revisión: reportes pendientes y auto-ocultados

export function ReviewPanel({ version }: { version: number }) {
  const { data, error, reload } = useLoad(() => api.admin.reports(), [version]);
  const now = useNow();
  if (error) return <p className="notice notice--error">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;
  if (data.length === 0) return <p className="empty">No hay reportes pendientes.</p>;
  return (
    <ul className="mod-list">
      {data.map((r) => (
        <li
          key={`${r.type}-${r.id}`}
          className={`mod-card${r.hiddenAt ? ' mod-card--hidden' : ''}`}
        >
          <div className="mod-card__top">
            <span className="tag">{TYPE_LABEL[r.type]}</span>
            <span className="tag tag--warn">
              {r.reportCount} {r.reportCount === 1 ? 'reporte' : 'reportes'}
            </span>
            {r.hiddenReason && (
              <span className="tag tag--danger">{REASON_LABEL[r.hiddenReason]}</span>
            )}
            <span className="muted mod-card__time" title={fullDate(r.lastReportAt)}>
              último {timeAgo(r.lastReportAt, now)}
            </span>
          </div>
          <p className="mod-card__text">{r.text}</p>
          <p className="meta">
            <strong>{r.authorName}</strong> · {r.institutionName} · {timeAgo(r.createdAt, now)}
          </p>
          {r.reasons.length > 0 && (
            <ul className="mod-card__reasons">
              {r.reasons.map((reason, i) => (
                <li key={i}>“{reason}”</li>
              ))}
            </ul>
          )}
          <ContentActions
            type={r.type}
            id={r.id}
            authorId={r.authorId}
            hidden={r.hiddenAt !== null}
            reported
            onDone={reload}
          />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// En vivo: todo lo publicado

export function FeedPanel({
  items,
  onChanged,
}: {
  items: ModContentItem[] | null;
  onChanged(): void;
}) {
  const [onlyHidden, setOnlyHidden] = useState(false);
  const now = useNow(15_000);
  if (!items) return <p className="muted">Cargando…</p>;
  const shown = onlyHidden ? items.filter((i) => i.hiddenAt !== null) : items;
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={onlyHidden}
          onChange={(e) => setOnlyHidden(e.target.checked)}
        />
        Solo ocultos
      </label>
      {shown.length === 0 && <p className="empty">Nada por aquí todavía.</p>}
      <ul className="mod-list">
        {shown.map((i) => (
          <li
            key={`${i.type}-${i.id}`}
            className={`mod-card${i.hiddenAt ? ' mod-card--hidden' : ''}`}
          >
            <div className="mod-card__top">
              <span className="tag">{TYPE_LABEL[i.type]}</span>
              {i.reportCount > 0 && <span className="tag tag--warn">{i.reportCount} reportes</span>}
              {i.hiddenReason && (
                <span className="tag tag--danger">{REASON_LABEL[i.hiddenReason]}</span>
              )}
              <span className="muted mod-card__time" title={fullDate(i.createdAt)}>
                {timeAgo(i.createdAt, now)}
              </span>
            </div>
            <p className="mod-card__text">{i.text}</p>
            <p className="meta">
              <strong>{i.authorName}</strong> · {i.institutionName}
            </p>
            <ContentActions
              type={i.type}
              id={i.id}
              authorId={i.authorId}
              hidden={i.hiddenAt !== null}
              reported={i.reportCount > 0}
              onDone={onChanged}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Palabras prohibidas

const MODE_HELP: Record<BannedWordMode, string> = {
  exact: 'Exacta: solo la palabra completa (ctm)',
  prefix: 'Empieza con: también sus variantes (puta → putas)',
  contains: 'Contiene: en cualquier parte de una palabra (usar solo raíces inequívocas)',
};

export function WordsPanel() {
  const { data, error, reload } = useLoad(() => api.admin.words(), []);
  const [term, setTerm] = useState('');
  const [mode, setMode] = useState<BannedWordMode>('prefix');
  const [filter, setFilter] = useState('');
  const [lastAdded, setLastAdded] = useState<{ id: number; term: string } | null>(null);

  const shown = useMemo(
    () => (data ?? []).filter((w) => w.term.includes(filter.trim().toLowerCase())),
    [data, filter],
  );

  async function add() {
    const toast = useStore.getState().toast;
    try {
      const created = await api.admin.addWord(term, mode);
      toast(`“${created.term}” agregada. Ya se bloquea en mensajes nuevos.`, 'success');
      setLastAdded(created);
      setTerm('');
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se pudo agregar.', 'error');
    }
  }

  async function apply(id: number, label: string) {
    const toast = useStore.getState().toast;
    try {
      const res = await api.admin.applyWord(id);
      toast(`“${label}”: ${res.pins} pines y ${res.replies} respuestas ocultados.`, 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se pudo aplicar.', 'error');
    }
    setLastAdded(null);
  }

  return (
    <div className="words-panel">
      <form
        className="words-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) void add();
        }}
      >
        <input
          className="input"
          placeholder="Nueva palabra (sin espacios)"
          value={term}
          maxLength={60}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Palabra"
        />
        <select
          className="input"
          value={mode}
          onChange={(e) => setMode(e.target.value as BannedWordMode)}
          aria-label="Modo"
        >
          <option value="exact">Exacta</option>
          <option value="prefix">Empieza con</option>
          <option value="contains">Contiene</option>
        </select>
        <button type="submit" className="btn btn--primary" disabled={!term.trim()}>
          Agregar
        </button>
      </form>
      <p className="muted small">{MODE_HELP[mode]}</p>

      {lastAdded && (
        <div className="notice">
          ¿Ocultar también el contenido ya publicado que contenga “{lastAdded.term}”?{' '}
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => void apply(lastAdded.id, lastAdded.term)}
          >
            Ocultar existente
          </button>{' '}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setLastAdded(null)}
          >
            No
          </button>
        </div>
      )}

      {error && <p className="notice notice--error">{error}</p>}
      <input
        className="input words-filter"
        placeholder={`Filtrar ${data?.length ?? 0} palabras…`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filtrar palabras"
      />
      <table className="table">
        <thead>
          <tr>
            <th>Palabra</th>
            <th>Modo</th>
            <th>Agregada por</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {shown.map((w) => (
            <tr key={w.id}>
              <td>
                <code>{w.term}</code>
              </td>
              <td>
                {w.mode === 'exact' ? 'Exacta' : w.mode === 'prefix' ? 'Empieza con' : 'Contiene'}
              </td>
              <td className="muted">{w.createdBy}</td>
              <td className="table__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => void apply(w.id, w.term)}
                >
                  Aplicar a lo publicado
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={async () => {
                    if (window.confirm(`¿Quitar “${w.term}” de la lista?`)) {
                      if (await runAction(() => api.admin.removeWord(w.id), 'Palabra quitada.'))
                        reload();
                    }
                  }}
                >
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usuarios

export function UsersPanel() {
  const [q, setQ] = useState('');
  const [silencedOnly, setSilencedOnly] = useState(false);
  const { data, error, reload } = useLoad(
    () => api.admin.users(q, silencedOnly),
    [q, silencedOnly],
  );
  return (
    <>
      <div className="toolbar-row">
        <input
          className="input"
          placeholder="Buscar por nombre o institución"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar usuarios"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={silencedOnly}
            onChange={(e) => setSilencedOnly(e.target.checked)}
          />
          Solo silenciados
        </label>
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Institución</th>
            <th className="num">Pines</th>
            <th className="num">Resp.</th>
            <th>Ingreso</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((u) => (
            <tr key={u.id} className={u.silencedAt ? 'row--muted' : ''}>
              <td>{u.name}</td>
              <td>{u.institutionName}</td>
              <td className="num">{u.pinCount}</td>
              <td className="num">{u.replyCount}</td>
              <td className="muted">{fullDate(u.createdAt)}</td>
              <td className="table__actions">
                <button
                  type="button"
                  className={`btn btn--sm ${u.silencedAt ? 'btn--ghost' : 'btn--danger'}`}
                  onClick={async () => {
                    const silence = !u.silencedAt;
                    if (
                      await runAction(
                        () => api.admin.silence(u.id, silence),
                        silence ? 'Usuario silenciado.' : 'Usuario reactivado.',
                      )
                    )
                      reload();
                  }}
                >
                  {u.silencedAt ? 'Reactivar' : 'Silenciar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// Estadísticas

const nf = new Intl.NumberFormat('es-CL');

export function StatsPanel({ version }: { version: number }) {
  const { data, error } = useLoad(() => api.admin.stats(), [version]);
  if (error) return <p className="notice notice--error">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;
  const tiles = [
    { label: 'Conectados ahora', value: data.online },
    { label: 'Asistentes', value: data.users },
    { label: 'Pines visibles', value: data.pins },
    { label: 'Respuestas visibles', value: data.replies },
    { label: 'Contenido oculto', value: data.hiddenPins + data.hiddenReplies },
    { label: 'Reportes pendientes', value: data.pendingReports },
  ];
  const max = Math.max(1, ...data.byInstitution.map((i) => i.users));
  return (
    <>
      <div className="kpis">
        {tiles.map((t) => (
          <div key={t.label} className="kpi">
            <span className="kpi__label">{t.label}</span>
            <span className="kpi__value">{nf.format(t.value)}</span>
          </div>
        ))}
      </div>
      <h3 className="section-title">Asistentes por institución</h3>
      <p className="muted small">Una sesión por cada vez que alguien ingresa con su nombre.</p>
      <table className="table table--bars">
        <thead>
          <tr>
            <th>Institución</th>
            <th>Asistentes</th>
            <th className="num">Pines</th>
            <th className="num">Respuestas</th>
          </tr>
        </thead>
        <tbody>
          {data.byInstitution.map((i) => (
            <tr key={i.institutionName}>
              <td>{i.institutionName}</td>
              <td>
                <span className="hbar" title={`${i.institutionName}: ${i.users} asistentes`}>
                  <span className="hbar__fill" style={{ width: `${(i.users / max) * 100}%` }} />
                  <span className="hbar__value">{nf.format(i.users)}</span>
                </span>
              </td>
              <td className="num">{nf.format(i.pins)}</td>
              <td className="num">{nf.format(i.replies)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// Exportar

export function ExportPanel() {
  const files = [
    {
      kind: 'pins',
      label: 'Pines',
      desc: 'Todos los pines con autor, institución, texto y estado.',
    },
    {
      kind: 'replies',
      label: 'Respuestas',
      desc: 'Todas las respuestas con su pin, autor y estado.',
    },
    { kind: 'users', label: 'Asistentes', desc: 'Sesiones con nombre, institución y actividad.' },
  ];
  return (
    <div className="exports">
      {files.map((f) => (
        <a key={f.kind} className="export" href={`/api/admin/export/${f.kind}.csv`} download>
          <strong>{f.label}</strong>
          <span className="muted">{f.desc}</span>
          <span className="export__cta">Descargar CSV</span>
        </a>
      ))}
      <p className="muted small">
        Los archivos se abren directamente en Excel (separador “;” y tildes correctas).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Secciones: el interruptor de los dos momentos del evento

const ESTADO_LABEL: Record<EstadoSeccion, string> = {
  abierta: 'Abierta',
  solo_lectura: 'Solo leer',
  oculta: 'Oculta',
};

const ESTADO_AYUDA: Record<EstadoSeccion, string> = {
  abierta: 'Se lee y se publica.',
  solo_lectura: 'Se lee, nadie puede publicar.',
  oculta: 'No aparece en la página.',
};

export function SeccionesPanel() {
  const { data, error, reload } = useLoad(() => api.admin.secciones(), []);
  if (error) return <p className="notice notice--error">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  const cambiar = async (id: string, estado: EstadoSeccion) => {
    if (await runAction(() => api.admin.setEstadoSeccion(id, estado), 'Sección actualizada.')) {
      reload();
    }
  };

  const aplicar = async (preset: { id: string; nombre: string }) => {
    if (!window.confirm(`¿Aplicar "${preset.nombre}"? Cambia varias secciones de una vez.`)) return;
    if (await runAction(() => api.admin.aplicarPreset(preset.id), `${preset.nombre} aplicado.`)) {
      reload();
    }
  };

  return (
    <div className="secciones-panel">
      <p className="muted">
        Lo que cierres aquí deja de aceptar publicaciones al instante, en todos los navegadores
        abiertos. Lo ya publicado se sigue leyendo.
      </p>

      <div className="secciones-presets">
        {data.presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn btn--ghost"
            onClick={() => void aplicar(p)}
          >
            <strong>{p.nombre}</strong>
            <span className="muted">{p.descripcion}</span>
          </button>
        ))}
      </div>

      <ul className="secciones-lista">
        {data.secciones.map((s) => (
          <li key={s.id} className="seccion">
            <div className="seccion__nombre">
              <strong>{s.nombre}</strong>
              <span className="muted">{ESTADO_AYUDA[s.estado]}</span>
            </div>
            <div className="seccion__estados" role="group" aria-label={`Estado de ${s.nombre}`}>
              {ESTADOS_SECCION.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`btn btn--sm ${e === s.estado ? 'btn--primary' : 'btn--ghost'}`}
                  aria-pressed={e === s.estado}
                  disabled={e === s.estado}
                  onClick={() => void cambiar(s.id, e)}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <PreguntasPanel />
    </div>
  );
}

function PreguntasPanel() {
  const { data, error, reload } = useLoad(() => api.admin.temas(), []);
  const [nombre, cambiarNombre] = useState('');
  const [guardando, cambiarGuardando] = useState(false);
  const preguntas = useMemo(() => data?.filter((tema) => tema.seccion === 'faq') ?? [], [data]);
  async function agregar() {
    if (guardando || !nombre.trim()) return;
    cambiarGuardando(true);
    try {
      if (await runAction(() => api.admin.agregarPregunta(nombre), 'Pregunta agregada.')) {
        cambiarNombre('');
        reload();
      }
    } finally {
      cambiarGuardando(false);
    }
  }
  async function ocultar(id: string, oculto: boolean) {
    if (
      await runAction(
        () => api.admin.ocultarPregunta(id, oculto),
        oculto ? 'Pregunta ocultada.' : 'Pregunta visible.',
      )
    )
      reload();
  }
  return (
    <section className="faq-admin">
      <h2>Preguntas frecuentes</h2>
      <p className="muted">
        Agrega las preguntas del equipo. Los universitarios responderán con notas dentro de cada
        pregunta.
      </p>
      <form
        className="faq-admin__formulario"
        onSubmit={(evento) => {
          evento.preventDefault();
          void agregar();
        }}
      >
        <label htmlFor="nueva-pregunta">Nueva pregunta</label>
        <input
          id="nueva-pregunta"
          className="input"
          value={nombre}
          onChange={(evento) => cambiarNombre(evento.target.value)}
          minLength={3}
          maxLength={200}
          required
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={guardando || nombre.trim().length < 3}
        >
          {guardando ? 'Agregando…' : 'Agregar pregunta'}
        </button>
      </form>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p className="muted">Cargando…</p>
      ) : preguntas.length === 0 ? (
        <p className="muted">Todavía no hay preguntas.</p>
      ) : (
        <ul className="secciones-lista">
          {preguntas.map((tema) => (
            <li className="seccion" key={tema.id}>
              <span>
                {tema.nombre}
                {tema.oculto ? ' (oculta)' : ''}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => void ocultar(tema.id, !tema.oculto)}
              >
                {tema.oculto ? 'Mostrar' : 'Ocultar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
