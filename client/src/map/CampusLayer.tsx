import { CAMPUS_AREA } from '@pizarra/shared';
import { memo, useMemo } from 'react';
import { useStore } from '../state/store';
import { BUILDINGS, campus, type MapFeature } from './campus';
import { EntornoLayer } from './EntornoLayer';
import { seleccionarRotulos } from './rotulos';
import { useState, useEffect } from 'react';

interface Props {
  k: number;
}

function Feature({ feature, interactive }: { feature: MapFeature; interactive: boolean }) {
  const openBuilding = useStore((s) => s.openBuilding);
  const selected = useStore((s) => s.openBuildingId === feature.id);

  if (!interactive) return <path className={`mapa__${feature.k}`} d={feature.d} />;

  return (
    <path
      className={`mapa__${feature.k} mapa__edificio--activo${selected ? ' mapa__edificio--abierto' : ''}`}
      d={feature.d}
      role="button"
      tabIndex={0}
      aria-label={`Ver información de ${feature.n}`}
      onClick={(e) => {
        e.stopPropagation();
        openBuilding(feature.id!);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBuilding(feature.id!);
        }
      }}
    >
      <title>{feature.n}</title>
    </path>
  );
}

/** Plano del campus: fondo de la superficie "mapa". */
function CampusLayerImpl({ k }: Props) {
  const placing = useStore((s) => s.placing !== null);
  const seleccionado = useStore((s) => s.openBuildingId);
  const abrirEdificio = useStore((s) => s.openBuilding);
  const [compacto, cambiarCompacto] = useState(
    () => window.matchMedia('(max-width: 767px)').matches,
  );
  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 767px)');
    const actualizar = (evento: MediaQueryListEvent) => cambiarCompacto(evento.matches);
    consulta.addEventListener('change', actualizar);
    return () => consulta.removeEventListener('change', actualizar);
  }, []);
  const rotulos = useMemo(
    () => seleccionarRotulos(campus.buildings, k, compacto, seleccionado, campus.minLabelArea),
    [k, compacto, seleccionado],
  );
  const limite = useMemo(
    () => `${CAMPUS_AREA.boundary.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')}Z`,
    [],
  );

  return (
    <g className="mapa">
      <EntornoLayer k={k} />
      <defs>
        <clipPath id="recorte-campus">
          <rect width={campus.world[0]} height={campus.world[1]} />
        </clipPath>
      </defs>
      <g clipPath="url(#recorte-campus)">
        <rect className="mapa__fondo" width={campus.viewBox[2]} height={campus.viewBox[3]} />
        {campus.features.map((f, i) => (
          <Feature
            key={f.id ?? `${f.k}-${i}`}
            feature={f}
            interactive={!placing && !!f.id && BUILDINGS.has(f.id)}
          />
        ))}
      </g>
      {rotulos.map(({ edificio, lineas }) => (
        <text
          key={edificio.id}
          className={`mapa__rotulo${placing ? '' : ' mapa__rotulo--activo'}${edificio.id === seleccionado ? ' mapa__rotulo--seleccionado' : ''}`}
          role={placing ? undefined : 'button'}
          tabIndex={placing ? undefined : 0}
          aria-label={placing ? undefined : `Ver información de ${edificio.name}`}
          onClick={
            placing
              ? undefined
              : (evento) => {
                  evento.stopPropagation();
                  abrirEdificio(edificio.id);
                }
          }
          onKeyDown={
            placing
              ? undefined
              : (evento) => {
                  if (evento.key === 'Enter' || evento.key === ' ') {
                    evento.preventDefault();
                    evento.stopPropagation();
                    abrirEdificio(edificio.id);
                  }
                }
          }
          x={edificio.cx}
          y={edificio.cy}
          fontSize={(compacto ? 11.5 : 12) / k}
          strokeWidth={3 / k}
        >
          <title>{edificio.name}</title>
          {lineas.map((linea, indice) => (
            <tspan
              key={indice}
              x={edificio.cx}
              dy={(indice === 0 ? (lineas.length === 2 ? -3 : 4) : 15) / k}
            >
              {linea}
            </tspan>
          ))}
        </text>
      ))}
      {/*
        Contorno de la universidad: hasta aquí se pueden poner pines. Se dibuja al final, sobre
        todo lo demás: si va antes, el verde del cerro y sobre todo el halo blanco de los
        rótulos lo van borroneando justo donde el borde cruza la zona construida (poniente y
        sur). El realce claro de abajo lo mantiene legible sobre cualquier fondo.
      */}
      <path className="mapa__limite-realce" d={limite} strokeWidth={5 / k} />
      <path
        className={`mapa__limite${placing ? ' mapa__limite--activo' : ''}`}
        d={limite}
        strokeWidth={2.4 / k}
        strokeDasharray={`${12 / k} ${8 / k}`}
      />
    </g>
  );
}

export const CampusLayer = memo(CampusLayerImpl);
