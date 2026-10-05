import { postitSize } from '@pizarra/shared';
import { useMemo } from 'react';
import { useStore } from '../state/store';
import { ordenarPines } from './orden';
import { Pin } from './Pin';
import { Postit } from './Postit';
import { lodFor, type View } from './view';

/** Cuantiza el zoom (pasos de ~10 %) para que los pines memoizados no se re-rendericen de más. */
function quantize(k: number): number {
  return Math.exp(Math.round(Math.log(k) * 10) / 10);
}

/** En el mapa los pines se dibujan más chicos: 12 m de radio taparían un edificio. */
const SCALE: Record<string, number> = { map: 0.55 };

export function PinLayer({ view }: { view: View }) {
  const surface = useStore((s) => s.surface);
  const pins = useStore((s) => s.pins);
  const openPinId = useStore((s) => s.openPinId);
  const highlight = useStore((s) => s.highlight);
  const fresh = useStore((s) => s.fresh);
  const openPin = useStore((s) => s.openPin);

  const lod = lodFor(view.k);
  const k = quantize(view.k);

  // Culling: solo lo que está dentro de la región visible (+ margen). Lo grande se dibuja
  // primero para que lo pequeño quede encima y se pueda tocar.
  const visible = useMemo(() => {
    const m = postitSize(Infinity, Infinity);
    const out = [];
    for (const p of pins.values()) {
      if (p.x < view.x0 - m || p.x > view.x1 + m || p.y < view.y0 - m || p.y > view.y1 + m)
        continue;
      out.push(p);
    }
    // Los grandes primero: los chicos quedan encima y se pueden tocar.
    out.sort(ordenarPines);
    return out;
  }, [pins, view]);

  return (
    <g className="pins">
      {visible.map((p) => {
        const comun = {
          pin: p,
          k,
          lod,
          selected: p.id === openPinId,
          dimmed: highlight !== null && !highlight.has(p.id),
          fresh: fresh.has(p.id),
          onOpen: openPin,
        };
        // La pizarra usa post-it; el mapa, chinches (no taparían los edificios).
        return surface === 'map' ? (
          <Pin key={p.id} scale={SCALE.map!} {...comun} />
        ) : (
          <Postit key={p.id} {...comun} />
        );
      })}
    </g>
  );
}
