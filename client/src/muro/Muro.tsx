import { PAPER_HEX, PIN_COLORS, PIN_COLOR_HEX, type PinSummary } from '@pizarra/shared';
import { useMemo, useState, type CSSProperties } from 'react';
import { timeAgo, useNow } from '../lib/time';
import { puedePublicar, useStore } from '../state/store';
import { MarcaModeracion } from '../ui/MarcaModeracion';
import { ComposerMuro } from './ComposerMuro';

type Orden = 'recientes' | 'comentadas';

/**
 * Un muro: las notas de una sección como tarjetas en una lista, sin lugar en un lienzo.
 * Lo usan Consejos, Historias, Carreras y Preguntas frecuentes.
 *
 * Reusa todo lo que ya existe: las notas son los mismos pines, el hilo es el mismo panel y el
 * filtro de búsqueda es el mismo resaltado.
 */
export function Muro({
  nombre,
  temaId,
  integrado = false,
}: {
  nombre: string;
  temaId?: string;
  integrado?: boolean;
}) {
  const pins = useStore((s) => s.pins);
  const loaded = useStore((s) => s.loaded);
  const highlight = useStore((s) => s.highlight);
  const openPin = useStore((s) => s.openPin);
  const openPinId = useStore((s) => s.openPinId);
  const abierta = useStore(puedePublicar);
  const [orden, setOrden] = useState<Orden>('recientes');
  const now = useNow();

  const notas = useMemo(() => {
    const todas = [...pins.values()].filter(
      (nota) => temaId === undefined || nota.temaId === temaId,
    );
    const visibles = highlight ? todas.filter((p) => highlight.has(p.id)) : todas;
    return visibles.sort((a, b) =>
      orden === 'comentadas'
        ? b.replyCount - a.replyCount || b.createdAt - a.createdAt
        : b.createdAt - a.createdAt,
    );
  }, [pins, highlight, orden, temaId]);
  const Titulo = integrado ? 'h2' : 'h1';

  return (
    <section className={integrado ? 'muro__contenido' : 'muro'}>
      <header className="muro__head">
        <Titulo className="muro__titulo">{nombre}</Titulo>
        <div className="muro__orden" role="group" aria-label="Ordenar">
          {(['recientes', 'comentadas'] as const).map((o) => (
            <button
              key={o}
              type="button"
              className={`btn btn--sm ${orden === o ? 'btn--primary' : 'btn--ghost'}`}
              aria-pressed={orden === o}
              onClick={() => setOrden(o)}
            >
              {o === 'recientes' ? 'Más recientes' : 'Más comentadas'}
            </button>
          ))}
        </div>
      </header>

      {abierta ? (
        <ComposerMuro temaId={temaId} />
      ) : (
        <p className="muted muro__aviso">Esta sección está solo para leer.</p>
      )}

      {!loaded ? (
        <p className="muted muro__aviso">Cargando…</p>
      ) : notas.length === 0 ? (
        <p className="empty muro__aviso">
          {highlight
            ? 'Ninguna nota coincide con la búsqueda.'
            : abierta
              ? 'Todavía no hay nada acá. Puedes ser el primero.'
              : 'Todavía no hay nada acá.'}
        </p>
      ) : (
        <ul className="muro__lista">
          {notas.map((nota) => (
            <li key={nota.id}>
              <Tarjeta
                nota={nota}
                abierta={openPinId === nota.id}
                now={now}
                onOpen={() => openPin(nota.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tarjeta({
  nota,
  abierta,
  now,
  onOpen,
}: {
  nota: PinSummary;
  abierta: boolean;
  now: number;
  onOpen(): void;
}) {
  const tipo = PIN_COLORS.find((c) => c.id === nota.color);
  return (
    <button
      type="button"
      className={`tarjeta${nota.autorModerador ? ' tarjeta--moderador' : ''}${abierta ? ' tarjeta--abierta' : ''}`}
      style={
        { '--papel': PAPER_HEX[nota.color], '--pin': PIN_COLOR_HEX[nota.color] } as CSSProperties
      }
      onClick={onOpen}
    >
      {nota.autorModerador && <MarcaModeracion nombre={nota.autorModerador} />}
      <p className="tarjeta__texto">{nota.preview}</p>
      <footer className="tarjeta__pie">
        <span className="tarjeta__quien">
          {nota.authorName} · {nota.institutionName}
        </span>
        <span className="tarjeta__datos">
          {tipo && <span className="tarjeta__tipo">{tipo.label}</span>}
          <span>{timeAgo(nota.createdAt, now)}</span>
          <span>
            {nota.replyCount} {nota.replyCount === 1 ? 'respuesta' : 'respuestas'}
          </span>
        </span>
      </footer>
    </button>
  );
}
