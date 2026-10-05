import { PIN_RADIUS, PIN_COLORS, escalaNota, type PinSummary } from '@pizarra/shared';
import { Corona } from '../ui/MarcaModeracion';
import { memo } from 'react';
import type { Lod } from './view';

interface Props {
  pin: PinSummary;
  /** Factor sobre el radio según la superficie (en el mapa los pines van más chicos). */
  scale: number;
  /** Zoom cuantizado (para tamaños mínimos en pantalla y etiquetas legibles). */
  k: number;
  lod: Lod;
  selected: boolean;
  dimmed: boolean;
  fresh: boolean;
  onOpen(id: number): void;
}

const LABEL_CHARS = 42;

function PinImpl({ pin, scale, k, lod, selected, dimmed, fresh, onOpen }: Props) {
  // En el mapa el pin crece igual que el post-it, partiendo del radio base.
  const r = PIN_RADIUS.base * escalaNota(pin.replyCount, pin.vistas) * scale;
  // Tamaño mínimo en pantalla para que siempre se vea y se pueda tocar.
  const minScreen = lod === 0 ? 5 : 9;
  const rr = Math.max(r, minScreen / k);
  const hit = Math.max(rr + 2 / k, 22 / k);
  const tipo = PIN_COLORS.find((color) => color.id === pin.color)!.label;
  const label =
    pin.preview.length > LABEL_CHARS ? `${pin.preview.slice(0, LABEL_CHARS - 1)}…` : pin.preview;

  return (
    <g
      className={`pin${pin.autorModerador ? ' pin--moderador' : ''}${dimmed ? ' pin--dim' : ''}${selected ? ' pin--selected' : ''}`}
      transform={`translate(${pin.x} ${pin.y})`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(pin.id);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${tipo} de ${pin.authorName}${pin.autorModerador ? ' (moderación)' : ''}: ${pin.preview}. ${pin.replyCount} respuestas`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(pin.id);
        }
      }}
    >
      <title>
        {tipo}: {pin.preview}
      </title>
      <circle className="pin__hit" r={hit} />
      <circle className="pin__halo" r={rr + 2 / k} />
      {pin.autorModerador && (
        <>
          <circle className="borde-moderacion" r={rr + 5 / k} strokeWidth={3 / k} />
          <Corona
            className="corona-moderacion"
            x={-10 / k}
            y={-rr - 24 / k}
            width={20 / k}
            height={20 / k}
          />
        </>
      )}
      {selected && <circle className="pin__ring" r={rr + 5 / k} strokeWidth={2.5 / k} />}
      {fresh && <circle className="pin__pulse" r={rr} strokeWidth={3 / k} />}
      {lod === 0 ? (
        <circle className="pin__head" r={rr} fill={`url(#pin-${pin.color})`} />
      ) : (
        <>
          <circle className="pin__shadow" r={rr} cy={rr * 0.18} />
          <circle className="pin__head" r={rr} fill={`url(#pin-${pin.color})`} />
          <circle className="pin__shine" r={rr * 0.32} cx={-rr * 0.32} cy={-rr * 0.34} />
          {pin.replyCount > 0 && (
            <g transform={`translate(${rr * 0.72} ${-rr * 0.72})`}>
              <circle className="pin__badge" r={9 / k} strokeWidth={1.5 / k} />
              <text className="pin__badge-text" fontSize={10 / k} dy={3.5 / k}>
                {pin.replyCount > 99 ? '99+' : pin.replyCount}
              </text>
            </g>
          )}
          {(lod === 2 || selected) && (
            <text
              className="pin__label"
              x={rr + 7 / k}
              dy={4 / k}
              fontSize={12.5 / k}
              strokeWidth={4 / k}
            >
              {label}
            </text>
          )}
        </>
      )}
    </g>
  );
}

export const Pin = memo(PinImpl);
