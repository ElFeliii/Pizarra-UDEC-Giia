import { PAPER_HEX, PIN_COLOR_HEX, postitSize, type PinSummary } from '@pizarra/shared';
import { Corona } from '../ui/MarcaModeracion';
import { memo } from 'react';
import type { Lod } from './view';

interface Props {
  pin: PinSummary;
  /** Zoom cuantizado (para tamaños mínimos en pantalla). */
  k: number;
  lod: Lod;
  selected: boolean;
  dimmed: boolean;
  fresh: boolean;
  onOpen(id: number): void;
}

/**
 * Línea ondulada que simula escritura a mano: de lejos no se lee el contenido, solo se ve
 * que el papel tiene algo escrito.
 */
function squiggle(x: number, y: number, width: number, amp: number, segs: number): string {
  const seg = width / segs;
  let d = `M${x} ${y}`;
  for (let i = 0; i < segs; i++) {
    d += `q${(seg / 2).toFixed(2)} ${(i % 2 === 0 ? -amp : amp).toFixed(2)} ${seg.toFixed(2)} 0`;
  }
  return d;
}

/** Inclinación estable por pin: los papeles no quedan todos rectos, pero tampoco cambian. */
function tilt(id: number): number {
  return ((id * 37) % 9) - 4;
}

function PostitImpl({ pin, k, lod, selected, dimmed, fresh, onOpen }: Props) {
  const paper = PAPER_HEX[pin.color];
  const ink = PIN_COLOR_HEX[pin.color];
  // Tamaño mínimo en pantalla: de muy lejos el papel igual se ve.
  const s = Math.max(postitSize(pin.replyCount, pin.vistas), (lod === 0 ? 6 : 16) / k);
  const h = s / 2;
  const hit = Math.max(s, 34 / k);

  const lineas = s < 36 ? 2 : s < 70 ? 3 : 4;
  const pad = s * 0.17;
  const ancho = s - pad * 2;
  const anchos = [1, 0.93, 0.76, 0.55];
  const grosor = Math.max(s * 0.028, 0.35 / k);

  const tapeW = s * 0.46;
  const tapeH = s * 0.2;

  return (
    <g
      className={`postit${pin.autorModerador ? ' postit--moderador' : ''}${dimmed ? ' postit--dim' : ''}${selected ? ' postit--selected' : ''}`}
      transform={`translate(${pin.x} ${pin.y}) rotate(${tilt(pin.id)})`}
      role="button"
      tabIndex={lod === 0 ? -1 : 0}
      aria-label={`Nota de ${pin.authorName}${pin.autorModerador ? ' (moderación)' : ''}: ${pin.preview}. ${pin.replyCount} respuestas`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(pin.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(pin.id);
        }
      }}
    >
      <rect className="postit__hit" x={-hit / 2} y={-hit / 2} width={hit} height={hit} />
      <rect className="postit__sombra" x={-h + s * 0.02} y={-h + s * 0.03} width={s} height={s} />
      <rect className="postit__papel" x={-h} y={-h} width={s} height={s} fill={paper} />

      {pin.autorModerador && (
        <>
          <rect
            className="borde-moderacion"
            x={-h - 4 / k}
            y={-h - 4 / k}
            width={s + 8 / k}
            height={s + 8 / k}
            strokeWidth={3 / k}
          />
          <Corona
            className="corona-moderacion"
            x={-10 / k}
            y={-h - 27 / k}
            width={20 / k}
            height={20 / k}
          />
        </>
      )}
      {lod > 0 && (
        <>
          {/* Doblez inferior: una franja apenas más oscura del mismo color. */}
          <rect x={-h} y={h - s * 0.18} width={s} height={s * 0.18} fill={ink} opacity={0.09} />

          {Array.from({ length: lineas }, (_, i) => (
            <path
              key={i}
              className="postit__garabato"
              d={squiggle(-h + pad, -h + pad + i * (s * 0.17), ancho * anchos[i]!, s * 0.016, 5)}
              stroke={ink}
              strokeWidth={grosor}
            />
          ))}

          {/* Cinta transparente, centrada y a caballo del borde de arriba. */}
          <g transform={`rotate(${-tilt(pin.id) - 3})`}>
            <rect
              className="postit__cinta"
              x={-tapeW / 2}
              y={-h - tapeH * 0.55}
              width={tapeW}
              height={tapeH}
              strokeWidth={Math.max(s * 0.006, 0.2 / k)}
            />
            <rect
              className="postit__cinta-brillo"
              x={-tapeW / 2}
              y={-h - tapeH * 0.55}
              width={tapeW}
              height={tapeH * 0.3}
            />
          </g>

          {selected && (
            <rect
              className="postit__borde"
              x={-h - s * 0.05}
              y={-h - s * 0.05}
              width={s * 1.1}
              height={s * 1.1}
              strokeWidth={2.5 / k}
            />
          )}
          {fresh && (
            <rect
              className="postit__pulso"
              x={-h}
              y={-h}
              width={s}
              height={s}
              strokeWidth={3 / k}
            />
          )}

          {pin.replyCount > 0 && (
            <g transform={`translate(${h - s * 0.02} ${-h + s * 0.02})`}>
              <circle className="postit__badge" r={9 / k} strokeWidth={1.5 / k} />
              <text className="postit__badge-text" fontSize={10 / k} dy={3.5 / k}>
                {pin.replyCount > 99 ? '99+' : pin.replyCount}
              </text>
            </g>
          )}
        </>
      )}
    </g>
  );
}

export const Postit = memo(PostitImpl);
