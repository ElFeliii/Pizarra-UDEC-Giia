import { useStore } from '../state/store';

/** "Palabras más repetidas": chips con tamaño proporcional a la frecuencia. */
export function TopWords({ onPick }: { onPick(word: string): void }) {
  const words = useStore((s) => s.topWords);

  if (words.length === 0) {
    return <p className="words__empty">Aún no hay suficientes mensajes.</p>;
  }

  const max = words[0]!.count;
  const min = words[words.length - 1]!.count;
  const scale = (c: number) => (max === min ? 1 : (c - min) / (max - min));

  return (
    <ul className="words" aria-label="Palabras más repetidas">
      {words.map((w, i) => (
        <li key={w.word}>
          <button
            type="button"
            className="word"
            style={{ fontSize: `${0.85 + scale(w.count) * 0.5}rem` }}
            onClick={() => onPick(w.word)}
            title={`${w.count} ${w.count === 1 ? 'mensaje' : 'mensajes'}`}
          >
            <span className="word__rank">{i + 1}</span>
            {w.word}
            <span className="word__count">{w.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
