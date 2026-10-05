import type { ModContentItem } from '@pizarra/shared';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../api/http';
import { createSocket } from '../api/socket';
import { useLoad } from '../moderation/common';
import {
  ExportPanel,
  FeedPanel,
  ReviewPanel,
  SeccionesPanel,
  StatsPanel,
  UsersPanel,
  WordsPanel,
} from '../moderation/Panels';
import { useStore } from '../state/store';
import { Toasts } from '../ui/Toasts';

type Tab = 'review' | 'feed' | 'secciones' | 'words' | 'users' | 'stats' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'Revisión' },
  { id: 'feed', label: 'En vivo' },
  { id: 'secciones', label: 'Secciones' },
  { id: 'words', label: 'Palabras' },
  { id: 'users', label: 'Usuarios' },
  { id: 'stats', label: 'Estadísticas' },
  { id: 'export', label: 'Exportar' },
];

function Login({ onLogin }: { onLogin(name: string): void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  return (
    <main className="entry">
      <form
        className="entry__card"
        onSubmit={async (e) => {
          e.preventDefault();
          setSending(true);
          setError(null);
          try {
            const res = await api.admin.login(password, name);
            useStore.getState().setModerator(res.name);
            onLogin(res.name);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
          } finally {
            setSending(false);
          }
        }}
      >
        <h1 className="entry__title">Moderación</h1>
        <p className="entry__lead">
          Acceso solo para el equipo organizador. Usa el nombre y la clave que te asignaron: tus
          acciones quedan registradas con ese nombre.
        </p>
        <label className="field">
          <span className="field__label">Tu nombre de moderador</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            minLength={2}
            maxLength={40}
          />
        </label>
        <label className="field">
          <span className="field__label">Contraseña</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={sending}>
          {sending ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="entry__fine">
          <a href="/">← Volver a la pizarra</a>
        </p>
      </form>
    </main>
  );
}

function Panel({ name, onLogout }: { name: string; onLogout(): void }) {
  const [tab, setTab] = useState<Tab>('review');
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(0);
  const feed = useLoad(() => api.admin.feed(), []);
  const { setData: setFeed, reload: reloadFeed } = feed;

  // Eventos en vivo de la sala "mods".
  useEffect(() => {
    const s = createSocket();
    const bump = () => setVersion((v) => v + 1);
    s.on('mod:feed', (item: ModContentItem) =>
      setFeed((cur) => (cur ? [item, ...cur].slice(0, 300) : cur)),
    );
    s.on('mod:report', (r) => {
      bump();
      setPending((p) => p + 1);
      if (r.autoHidden)
        useStore.getState().toast('Un contenido se ocultó automáticamente por reportes.', 'info');
    });
    s.on('mod:changed', (c) => {
      bump();
      setFeed(
        (cur) =>
          cur?.map((i) =>
            i.type === c.type && i.id === c.id
              ? { ...i, hiddenAt: c.hiddenAt, hiddenReason: c.hiddenReason }
              : i,
          ) ?? cur,
      );
    });
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [setFeed]);

  return (
    <div className="mod">
      <header className="mod__head">
        <div className="brand">
          <span className="brand__dot" aria-hidden="true" />
          <span className="brand__name">Moderación</span>
        </div>
        <span className="muted">{name}</span>
        <a className="btn btn--sm btn--ghost" href="/" target="_blank" rel="noreferrer">
          Ver pizarra
        </a>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={async () => {
            await api.admin.logout().catch(() => {});
            useStore.getState().setModerator(null);
            onLogout();
          }}
        >
          Salir
        </button>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            className="tab"
            onClick={() => {
              setTab(t.id);
              if (t.id === 'review') setPending(0);
            }}
          >
            {t.label}
            {t.id === 'review' && pending > 0 && tab !== 'review' && (
              <span className="tab__badge">{pending}</span>
            )}
          </button>
        ))}
      </nav>
      <main className="mod__body">
        {tab === 'review' && <ReviewPanel version={version} />}
        {tab === 'feed' && <FeedPanel items={feed.data} onChanged={reloadFeed} />}
        {tab === 'secciones' && <SeccionesPanel />}
        {tab === 'words' && <WordsPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'stats' && <StatsPanel version={version} />}
        {tab === 'export' && <ExportPanel />}
      </main>
      <Toasts />
    </div>
  );
}

export function Moderador() {
  const [me, setMe] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api.admin
      .me()
      .then((r) => setMe(r.name))
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <div className="loading">Cargando…</div>;
  if (me === null) return <Login onLogin={setMe} />;
  return <Panel name={me} onLogout={() => setMe(null)} />;
}
