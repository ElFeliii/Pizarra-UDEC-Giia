import { LIMITS, PIN_COLOR_HEX, type PinColorId } from '@pizarra/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getSocket } from '../api/realtime';
import { useStore } from '../state/store';

const ACK_TIMEOUT_MS = 8000;

/** Redacción de la nota de un pin nuevo. */
export function Composer({
  at,
  color,
  onClose,
}: {
  at: { x: number; y: number };
  color: PinColorId;
  onClose(): void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const silenced = useStore((s) => s.silenced);
  const surface = useStore((s) => s.surface);
  const esMapa = surface === 'map';
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => ref.current?.focus(), []);

  async function submit() {
    const socket = getSocket();
    if (!socket || !text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('pin:create', { surface, x: at.x, y: at.y, color, text });
      const st = useStore.getState();
      if (res.ok) {
        st.upsertPin(res.data);
        st.cancelPlacing();
        st.toast(esMapa ? '¡Pin publicado!' : '¡Nota publicada!', 'success');
        onClose();
        return;
      }
      if (res.error.code === 'EN_REVISION') {
        st.cancelPlacing();
        st.toast(res.error.message, 'info');
        onClose();
        return;
      }
      if (res.error.code === 'NO_SESSION') st.setSession(null);
      setError(res.error.message);
    } catch {
      setError('El servidor no respondió. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  const left = LIMITS.pin.max - text.length;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">
      <div className="modal__backdrop" onClick={onClose} />
      <form
        className="modal__card sheet"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header className="modal__head">
          <span className="dot" style={{ '--pin': PIN_COLOR_HEX[color] } as CSSProperties} />
          <h2 id="composer-title">{esMapa ? 'Nuevo pin' : 'Nueva nota'}</h2>
        </header>
        {silenced ? (
          <p className="notice notice--error">
            Un moderador desactivó tu participación. Aún puedes leer la pizarra.
          </p>
        ) : (
          <>
            <label className="sr-only" htmlFor="composer-text">
              Tu nota
            </label>
            <textarea
              id="composer-text"
              ref={ref}
              className="input textarea"
              placeholder="Escribe una pregunta, idea o comentario…"
              maxLength={LIMITS.pin.max}
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
              }}
            />
            <div className="composer__meta">
              <span className={left < 20 ? 'counter counter--low' : 'counter'}>{left}</span>
            </div>
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={silenced || sending || !text.trim()}
          >
            {sending ? 'Publicando…' : 'Publicar'}
          </button>
        </footer>
      </form>
    </div>
  );
}
