import { LIMITS, PIN_COLOR_HEX, type Reply, type TargetType } from '@pizarra/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ApiError, api } from '../api/http';
import { getSocket, socketConSesion } from '../api/realtime';
import { fullDate, timeAgo, useNow } from '../lib/time';
import { idVisitante } from '../lib/visitante';
import { useStore } from '../state/store';
import { IconBan, IconEyeOff, IconFlag, IconSend, IconX } from '../ui/icons';
import { MarcaModeracion } from '../ui/MarcaModeracion';
import { useThread } from './useThread';

const ACK_TIMEOUT_MS = 8000;

function Meta({
  name,
  institution,
  at,
  now,
  moderador,
}: {
  name: string;
  institution: string;
  at: number;
  now: number;
  moderador?: string | null;
}) {
  return (
    <p className="meta">
      <strong>{name}</strong>
      {moderador && <MarcaModeracion nombre={moderador} />}
      <span className="meta__sep">·</span>
      <span>{institution}</span>
      <span className="meta__sep">·</span>
      <time dateTime={new Date(at).toISOString()} title={fullDate(at)}>
        {timeAgo(at, now)}
      </time>
    </p>
  );
}

/** Acciones por elemento: reportar (todos) y ocultar / silenciar (moderador). */
function ItemActions({
  type,
  id,
  authorId,
  onHidden,
}: {
  type: TargetType;
  id: number;
  authorId: number;
  onHidden?(): void;
}) {
  const moderator = useStore((s) => s.moderator);
  const session = useStore((s) => s.session);
  const pedirRegistro = useStore((s) => s.pedirRegistro);
  const toast = useStore((s) => s.toast);
  const mine = session?.user.id === authorId;

  async function report() {
    if (!window.confirm('¿Reportar este contenido a los moderadores?')) return;
    try {
      const socket = await socketConSesion();
      const res = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('report:create', { targetType: type, targetId: id });
      toast(
        res.ok ? 'Gracias. Un moderador lo revisará.' : res.error.message,
        res.ok ? 'success' : 'error',
      );
    } catch {
      toast('No se pudo enviar el reporte.', 'error');
    }
  }

  async function modAction(action: 'hide' | 'silence') {
    try {
      if (action === 'hide') {
        await api.admin.content(type, id, 'hide');
        onHidden?.();
        toast('Contenido ocultado.', 'success');
      } else if (window.confirm('¿Silenciar a este usuario? Podrá leer, pero no publicar.')) {
        await api.admin.silence(authorId, true);
        toast('Usuario silenciado.', 'success');
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se pudo completar la acción.', 'error');
    }
  }

  return (
    <div className="item-actions">
      {!mine && (
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={() =>
            session
              ? void report()
              : pedirRegistro('Para reportar necesitamos tu nombre.', () => void report())
          }
          title="Reportar"
          aria-label="Reportar"
        >
          <IconFlag size={15} />
        </button>
      )}
      {moderator && (
        <>
          <button
            type="button"
            className="icon-btn icon-btn--sm icon-btn--danger"
            onClick={() => void modAction('hide')}
            title="Ocultar (moderador)"
            aria-label="Ocultar"
          >
            <IconEyeOff size={15} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm icon-btn--danger"
            onClick={() => void modAction('silence')}
            title="Silenciar autor (moderador)"
            aria-label="Silenciar autor"
          >
            <IconBan size={15} />
          </button>
        </>
      )}
    </div>
  );
}

const REPLY_MAX_HEIGHT = 140;

/** Ajusta el alto del textarea a su contenido, hasta un máximo (luego aparece el scroll). */
function autosize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, REPLY_MAX_HEIGHT)}px`;
  el.style.overflowY = el.scrollHeight > REPLY_MAX_HEIGHT ? 'auto' : 'hidden';
}

function ReplyForm({ pinId, onSent }: { pinId: number; onSent(r: Reply): void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const silenced = useStore((s) => s.silenced);
  const abierta = useStore((s) => s.secciones.get(s.seccion)?.estado === 'abierta');
  const pedirRegistro = useStore((s) => s.pedirRegistro);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => autosize(inputRef.current), [text]);

  if (silenced) {
    return <p className="notice notice--error thread__form">Tu participación está desactivada.</p>;
  }
  if (!abierta) return <p className="muted thread__form">Esta sección está solo para leer.</p>;

  async function submit() {
    if (!text.trim() || sending) return;
    // Si todavía no dio su nombre, se le pide y la respuesta sale sola al volver.
    if (!useStore.getState().session) {
      pedirRegistro('Para responder necesitamos tu nombre.', () => void submit());
      return;
    }
    setSending(true);
    setError(null);
    try {
      const socket = await socketConSesion();
      if (useStore.getState().openPinId !== pinId) return;
      const res = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('reply:create', { pinId, text });
      if (res.ok) {
        onSent(res.data);
        setText('');
      } else if (res.error.code === 'EN_REVISION') {
        useStore.getState().toast(res.error.message, 'info');
        setText('');
      } else {
        if (res.error.code === 'NO_SESSION') useStore.getState().setSession(null);
        setError(res.error.message);
      }
    } catch {
      setError('El servidor no respondió. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="thread__form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="reply-box">
        <label className="sr-only" htmlFor="reply-text">
          Tu respuesta
        </label>
        <textarea
          id="reply-text"
          ref={inputRef}
          className="input textarea reply-box__input"
          placeholder="Escribe una respuesta…"
          maxLength={LIMITS.reply.max}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="submit"
          className="icon-btn icon-btn--primary"
          disabled={sending || !text.trim()}
          aria-label="Enviar respuesta"
        >
          <IconSend size={18} />
        </button>
      </div>
    </form>
  );
}

/** Panel del hilo: lateral en escritorio, hoja inferior en celular. */
/** Lo que tiene que quedar abierta una nota para contar como vista. */
const VISTA_MS = 1500;

export function ThreadPanel() {
  const openPinId = useStore((s) => s.openPinId);
  const pin = useStore((s) => (s.openPinId !== null ? s.pins.get(s.openPinId) : undefined));
  const openPin = useStore((s) => s.openPin);
  const { thread, error, addReply, removeReply } = useThread(openPinId);
  const now = useNow();
  const listRef = useRef<HTMLOListElement>(null);
  // Con el hilo cargado, la lista es la fuente más fresca; si no, el contador del pin.
  const count = thread ? thread.replies.length : (pin?.replyCount ?? 0);

  // Mantener visible lo último al llegar respuestas nuevas.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  useEffect(() => {
    if (openPinId === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openPin(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPinId, openPin]);

  // Cuenta la visita recién cuando la nota lleva un momento abierta: abrirla y cerrarla al
  // instante, o pasar de largo con el teclado, no cuenta como haberla leído.
  useEffect(() => {
    if (openPinId === null) return;
    const t = setTimeout(() => {
      getSocket()?.emit('pin:visto', { pinId: openPinId, visitante: idVisitante() });
    }, VISTA_MS);
    return () => clearTimeout(t);
  }, [openPinId]);

  if (openPinId === null) return null;
  const detail = thread?.pin;
  const color = PIN_COLOR_HEX[(pin ?? detail)?.color ?? 'azul'];

  return (
    <aside
      className="thread sheet"
      aria-label="Hilo del pin"
      style={{ '--pin': color } as CSSProperties}
    >
      <header className="thread__head">
        <span className="dot" />
        <span className="thread__count">
          {count} {count === 1 ? 'respuesta' : 'respuestas'}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => openPin(null)}
          aria-label="Cerrar hilo"
        >
          <IconX />
        </button>
      </header>

      {error && <p className="notice notice--error">{error}</p>}
      {!thread && !error && (
        <div className="thread__loading" aria-busy="true">
          Cargando…
        </div>
      )}

      {detail && (
        <>
          <article className={`thread__pin${detail.autorModerador ? ' contenido--moderador' : ''}`}>
            <div className="item-head">
              <Meta
                name={detail.authorName}
                moderador={detail.autorModerador}
                institution={detail.institutionName}
                at={detail.createdAt}
                now={now}
              />
              <ItemActions
                type="pin"
                id={detail.id}
                authorId={detail.authorId}
                onHidden={() => openPin(null)}
              />
            </div>
            <p className="thread__text">{detail.text}</p>
          </article>

          <ol className="thread__replies" ref={listRef}>
            {thread.replies.length === 0 && (
              <li className="thread__empty">Aún no hay respuestas. ¡Sé el primero!</li>
            )}
            {thread.replies.map((r) => (
              <li key={r.id} className={`reply${r.autorModerador ? ' contenido--moderador' : ''}`}>
                <div className="item-head">
                  <Meta
                    name={r.authorName}
                    moderador={r.autorModerador}
                    institution={r.institutionName}
                    at={r.createdAt}
                    now={now}
                  />
                  <ItemActions
                    type="reply"
                    id={r.id}
                    authorId={r.authorId}
                    onHidden={() => removeReply(r.id)}
                  />
                </div>
                <p className="reply__text">{r.text}</p>
              </li>
            ))}
          </ol>

          <ReplyForm pinId={detail.id} onSent={addReply} />
        </>
      )}
    </aside>
  );
}
