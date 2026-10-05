import { LIMITS, PIN_COLORS, type PinColorId } from '@pizarra/shared';
import { useState, type CSSProperties } from 'react';
import { socketConSesion } from '../api/realtime';
import { useStore } from '../state/store';

const ACK_TIMEOUT_MS = 8000;

/**
 * Caja para publicar en un muro. Es el mismo acto que poner una nota en la pizarra, sin la
 * parte de elegir el lugar: acá la nota va a una lista.
 */
export function ComposerMuro({ temaId }: { temaId?: string }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<PinColorId>('verde');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seccion = useStore((s) => s.seccion);
  const silenced = useStore((s) => s.silenced);
  const pedirRegistro = useStore((s) => s.pedirRegistro);

  if (silenced) {
    return <p className="notice notice--error muro__aviso">Tu participación está desactivada.</p>;
  }

  async function submit() {
    if (!text.trim() || sending) return;
    if (!useStore.getState().session) {
      pedirRegistro('Para publicar acá necesitamos tu nombre.', () => void submit());
      return;
    }
    setSending(true);
    setError(null);
    try {
      const socket = await socketConSesion();
      const actual = useStore.getState();
      if (actual.seccion !== seccion || (temaId && actual.temaId !== temaId)) return;
      const res = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('nota:create', { seccion, temaId, color, text });
      const st = useStore.getState();
      if (res.ok) {
        st.upsertPin(res.data);
        st.toast('¡Publicado!', 'success');
        setText('');
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

  const restantes = LIMITS.pin.max - text.length;

  return (
    <form
      className="muro__composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        aria-label="Tu nota"
        className="input muro__caja"
        rows={3}
        maxLength={LIMITS.pin.max}
        placeholder="Escribe lo que quieras dejarle a quien venga…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="muro__composer-pie">
        <div className="swatches" role="radiogroup" aria-label="Tipo de nota">
          {PIN_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={color === c.id}
              aria-label={`${c.label}: ${c.significado}`}
              title={c.significado}
              className="swatch"
              style={{ '--pin': c.hex } as CSSProperties}
              onClick={() => setColor(c.id)}
            >
              <span className="swatch__label">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="muro__enviar">
          <span className={`contador${restantes < 20 ? ' contador--bajo' : ''}`}>{restantes}</span>
          <button type="submit" className="btn btn--primary" disabled={sending || !text.trim()}>
            {sending ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
