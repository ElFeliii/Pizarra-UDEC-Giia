import { PIN_COLORS } from '@pizarra/shared';
import type { CSSProperties } from 'react';
import { useStore } from '../state/store';

/** Los significados vienen del mismo catálogo que el selector de color de una nota. */
export function LeyendaMapa() {
  const visibles = useStore((s) => s.showPins);
  return (
    <aside className="mapa-leyenda" aria-label="Tipos de pin">
      <strong>{visibles ? 'Cada color cuenta algo' : 'Pines ocultos'}</strong>
      <ul>
        {PIN_COLORS.map((color) => (
          <li key={color.id} title={color.significado}>
            <span
              className="mapa-leyenda__color"
              aria-hidden="true"
              style={{ '--pin': color.hex } as CSSProperties}
            />
            {color.label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
