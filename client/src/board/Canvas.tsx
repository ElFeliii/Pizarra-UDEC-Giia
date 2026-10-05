import { BOARD_SIZE, PIN_COLORS, ZOOM } from '@pizarra/shared';
import { pointer, select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { registerCamera } from './camera';
import { encuadrarPines, limitarZoom, zoomMinimo } from './limitesZoom';
import { PinLayer } from './PinLayer';
import { computeView, needsUpdate, type View } from './view';
import type { World } from './world';

/** Cuánto se puede salir del mundo al desplazarse (margen de holgura para la cámara). */
const outsideMargin = (world: World) => Math.min(600, Math.max(world.width, world.height) * 0.15);

interface Props {
  nombre?: string;
  /** Mundo de la superficie: la pizarra mide 8000×8000 y el mapa, los metros del campus. */
  world?: World;
  /** Fondo de la superficie: la cuadrícula de la pizarra o el plano del campus. Recibe el zoom. */
  background?: (k: number) => ReactNode;
  /** Clic en un punto vacío (coordenadas de mundo). */
  onBoardClick?(x: number, y: number): void;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r} ${g} ${b})`;
}

function centerOn(x: number, y: number, k: number, w: number, h: number): ZoomTransform {
  return zoomIdentity
    .translate(w / 2, h / 2)
    .scale(k)
    .translate(-x, -y);
}

/** Al encuadrar pines, no alejarse tanto que queden como puntos (importa en celular). */
const INITIAL_MIN_K = 0.5;

/** Con menos pines que esto no vale la pena encuadrarlos: se muestra la superficie completa. */
const MIN_PINS_TO_FIT = 3;

/** Transformación que encuadra los pines (o el mundo completo si hay muy pocos). */
function fitTransform(w: number, h: number, world: World, minK: number = ZOOM.min): ZoomTransform {
  const pines = [...useStore.getState().pins.values()];
  const { x, y, k } = encuadrarPines(pines, world, w, h, minK);
  return centerOn(x, y, k, w, h);
}

function GridBackground({ k }: { k: number }) {
  const out = outsideMargin({ width: BOARD_SIZE, height: BOARD_SIZE });
  return (
    <>
      <rect
        className="board__outside"
        x={-out * 4}
        y={-out * 4}
        width={BOARD_SIZE + out * 8}
        height={BOARD_SIZE + out * 8}
      />
      <rect className="board__paper" width={BOARD_SIZE} height={BOARD_SIZE} />
      {k > 0.45 && <rect width={BOARD_SIZE} height={BOARD_SIZE} fill="url(#grid-fine)" />}
      <rect width={BOARD_SIZE} height={BOARD_SIZE} fill="url(#grid-coarse)" />
      <rect className="board__edge" width={BOARD_SIZE} height={BOARD_SIZE} strokeWidth={1.5 / k} />
    </>
  );
}

export function Canvas({
  nombre = 'Pizarra',
  world = { width: BOARD_SIZE, height: BOARD_SIZE },
  background,
  onBoardClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [view, setView] = useState<View>({ k: 1, x0: 0, y0: 0, x1: 0, y1: 0 });
  const viewRef = useRef(view);
  const fitted = useRef(false);
  const loaded = useStore((s) => s.loaded);
  const showPins = useStore((s) => s.showPins);

  useEffect(() => {
    const svg = svgRef.current!;
    const sel = select(svg);
    let raf = 0;

    const size = () => ({
      w: svg.clientWidth || window.innerWidth,
      h: svg.clientHeight || window.innerHeight,
    });

    const refreshView = (force = false) => {
      raf = 0;
      const { w, h } = size();
      const t = transformRef.current;
      if (force || needsUpdate(viewRef.current, t, w, h)) {
        const v = computeView(t, w, h);
        viewRef.current = v;
        setView(v);
      }
    };

    const out = outsideMargin(world);
    const zoomer = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([zoomMinimo(world, size().w, size().h), ZOOM.max])
      .translateExtent(
        world.limites ?? [
          [-out, -out],
          [world.width + out, world.height + out],
        ],
      )
      .on('zoom', (e: { transform: ZoomTransform }) => {
        transformRef.current = e.transform;
        // Se mueve el grupo directamente (sin React) y se agenda un recálculo por frame.
        worldRef.current?.setAttribute('transform', e.transform.toString());
        if (!raf) raf = requestAnimationFrame(() => refreshView());
      });
    zoomRef.current = zoomer;
    sel.call(zoomer).on('dblclick.zoom', null);

    registerCamera({
      flyTo(x, y, scale) {
        const { w, h } = size();
        const k = limitarZoom(scale ?? Math.max(transformRef.current.k, 1.4), world, w, h);
        sel
          .transition()
          .duration(650)
          .call(zoomer.transform, centerOn(x, y, k, w, h));
      },
      center() {
        const { w, h } = size();
        const [x, y] = transformRef.current.invert([w / 2, h / 2]);
        return { x, y };
      },
      zoomBy(f) {
        sel.transition().duration(220).call(zoomer.scaleBy, f);
      },
      verEntorno() {
        if (!world.limites) return;
        const { w, h } = size();
        const k = zoomMinimo(world, w, h);
        sel
          .transition()
          .duration(500)
          .call(zoomer.transform, centerOn(world.width / 2, world.height / 2, k, w, h));
      },
      fitAll() {
        const { w, h } = size();
        sel
          .transition()
          .duration(500)
          .call(zoomer.transform, fitTransform(w, h, world));
      },
    });

    // Vista inicial: el mundo completo, centrado (se reencuadra cuando llegan los pines).
    const { w, h } = size();
    sel.call(zoomer.transform, fitTransform(w, h, world, INITIAL_MIN_K));
    refreshView(true);

    let medidaAnterior = { w, h };
    const onResize = () => {
      const medida = size();
      const transformacion = transformRef.current;
      const [x, y] = transformacion.invert([medidaAnterior.w / 2, medidaAnterior.h / 2]);
      medidaAnterior = medida;
      // Al girar el celular, el mismo punto sigue en el centro y los pines no se salen de vista.
      zoomer.scaleExtent([zoomMinimo(world, medida.w, medida.h), ZOOM.max]);
      const escala = limitarZoom(transformacion.k, world, medida.w, medida.h);
      sel.interrupt().call(zoomer.transform, centerOn(x, y, escala, medida.w, medida.h));
      refreshView(true);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      sel.on('.zoom', null);
      registerCamera(null);
    };
  }, [world]);

  // Al cargar los pines por primera vez en esta superficie, encuadrarlos (sin animación).
  useEffect(() => {
    fitted.current = false;
  }, [world]);

  useEffect(() => {
    if (!loaded || fitted.current) return;
    fitted.current = true;
    const svg = svgRef.current;
    const zoomer = zoomRef.current;
    if (svg && zoomer && useStore.getState().pins.size >= MIN_PINS_TO_FIT) {
      select(svg).call(
        zoomer.transform,
        fitTransform(svg.clientWidth, svg.clientHeight, world, INITIAL_MIN_K),
      );
    }
  }, [loaded, world]);

  return (
    <svg
      ref={svgRef}
      className="board"
      role="application"
      aria-label={`${nombre}. Arrastra para moverte y usa la rueda o dos dedos para hacer zoom.`}
      onClick={(e) => {
        if (!onBoardClick) return;
        const [px, py] = pointer(e.nativeEvent, svgRef.current);
        const [x, y] = transformRef.current.invert([px, py]);
        if (x >= 0 && y >= 0 && x <= world.width && y <= world.height) onBoardClick(x, y);
      }}
    >
      <defs>
        <pattern id="grid-fine" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" className="grid-fine" />
        </pattern>
        <pattern id="grid-coarse" width="400" height="400" patternUnits="userSpaceOnUse">
          <path d="M400 0H0V400" className="grid-coarse" />
        </pattern>
        {PIN_COLORS.map((c) => (
          <radialGradient key={c.id} id={`pin-${c.id}`} cx="38%" cy="32%" r="78%">
            <stop offset="0" stopColor={lighten(c.hex, 0.38)} />
            <stop offset="0.55" stopColor={c.hex} />
            <stop offset="1" stopColor={c.hex} />
          </radialGradient>
        ))}
      </defs>
      <g ref={worldRef}>
        {background ? background(view.k) : <GridBackground k={view.k} />}
        {showPins && <PinLayer view={view} />}
      </g>
    </svg>
  );
}
