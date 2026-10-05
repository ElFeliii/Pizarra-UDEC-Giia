import { OUTSIDE_CAMPUS_MESSAGE, PAPER_HEX, PIN_COLOR_HEX, PIN_COLORS } from '@pizarra/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { useStore } from '../state/store';
import { camera } from './camera';
import { canPlaceAt, worldOf } from './world';

/**
 * Modo "poner pin": una mira fija al centro de la pantalla; el usuario mueve la superficie
 * hasta el lugar y confirma. Funciona igual con el dedo que con el mouse (en escritorio
 * también se puede hacer clic directo).
 *
 * En el mapa solo se puede poner dentro del campus: la mira avisa antes de intentarlo.
 */
export function Placement({ onPlace }: { onPlace(x: number, y: number): void }) {
  const placing = useStore((s) => s.placing);
  const setColor = useStore((s) => s.setPlacingColor);
  const cancel = useStore((s) => s.cancelPlacing);
  const surface = useStore((s) => s.surface);
  const [valido, setValido] = useState(true);

  // La mira sigue al centro de la pantalla: se revisa a cada rato si ese punto sirve.
  useEffect(() => {
    if (!placing) return;
    const check = () => {
      const c = camera.center();
      setValido(canPlaceAt(surface, c.x, c.y));
    };
    check();
    const t = setInterval(check, 150);
    return () => clearInterval(t);
  }, [placing, surface]);

  if (!placing) return null;

  const { width, height } = worldOf(surface);
  const clamp = (v: number, max: number) => Math.min(max - 20, Math.max(20, v));
  const esMapa = surface === 'map';

  return (
    <>
      <div
        className={`crosshair${valido ? '' : ' crosshair--invalido'}`}
        aria-hidden="true"
        style={
          {
            '--pin': PIN_COLOR_HEX[placing.color],
            '--papel': PAPER_HEX[placing.color],
          } as CSSProperties
        }
      >
        <span className="crosshair__shadow" />
        {esMapa ? (
          <span className="crosshair__pin" />
        ) : (
          <span className="crosshair__postit">
            <span className="crosshair__cinta" />
          </span>
        )}
      </div>
      <div className="placebar sheet" role="dialog" aria-label="Poner un pin">
        <p className={`placebar__hint${valido ? '' : ' placebar__hint--error'}`} role="status">
          {valido ? (
            <>
              Mueve {esMapa ? 'el mapa' : 'la pizarra'} para ubicar tu {esMapa ? 'pin' : 'nota'}
              <span className="desktop-only"> o haz clic donde quieras</span>
            </>
          ) : (
            OUTSIDE_CAMPUS_MESSAGE
          )}
        </p>
        <div className="swatches" role="radiogroup" aria-label="Tipo de nota">
          {PIN_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={placing.color === c.id}
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
        <div className="placebar__actions">
          <button type="button" className="btn btn--ghost" onClick={cancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!valido}
            onClick={() => {
              const c = camera.center();
              if (!canPlaceAt(surface, c.x, c.y)) return;
              onPlace(clamp(c.x, width), clamp(c.y, height));
            }}
          >
            Poner aquí
          </button>
        </div>
      </div>
    </>
  );
}
