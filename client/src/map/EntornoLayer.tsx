import { useEffect, useMemo, useState } from 'react';
import type { Entorno } from '../../../scripts/mapa/entorno';
import { campus } from './campus';
import { seleccionarRotulos } from './rotulos';

/** Se descarga solo al abrir el mapa; el campus sigue disponible si la capa no carga. */
export function EntornoLayer({ k }: { k: number }) {
  const [entorno, cambiarEntorno] = useState<Entorno | null>(null);
  useEffect(() => {
    let activa = true;
    import('./entorno.json')
      .then((m) => {
        if (activa) cambiarEntorno(m.default as Entorno);
      })
      .catch(() => {});
    return () => {
      activa = false;
    };
  }, []);
  const rotulos = useMemo(
    () =>
      seleccionarRotulos(entorno?.rotulos ?? [], k, true, null, 20, 0.1).filter(
        ({ caja }) =>
          caja.derecha < 0 ||
          caja.abajo < 0 ||
          caja.izquierda > campus.world[0] ||
          caja.arriba > campus.world[1],
      ),
    [entorno, k],
  );
  if (!entorno) return null;
  return (
    <g className="mapa__entorno" aria-label="Calles y lugares de Concepción">
      <rect
        x={entorno.limites[0][0]}
        y={entorno.limites[0][1]}
        width={entorno.limites[1][0] - entorno.limites[0][0]}
        height={entorno.limites[1][1] - entorno.limites[0][1]}
        className="mapa__fondo"
      />
      <g transform={`translate(${entorno.desplazamiento.join(' ')})`}>
        {entorno.formas.map((forma, indice) => (
          <path
            key={indice}
            className={`mapa__${forma.k}${forma.lineal ? ' mapa__agua--lineal' : ''}`}
            d={forma.d}
          />
        ))}
      </g>
      {rotulos.map(({ edificio, lineas }) => (
        <text
          key={edificio.id}
          className="mapa__rotulo mapa__rotulo--entorno"
          x={edificio.cx}
          y={edificio.cy}
          fontSize={11 / k}
          strokeWidth={3 / k}
        >
          <title>{edificio.name}</title>
          {lineas.map((linea, indice) => (
            <tspan key={indice} x={edificio.cx} dy={(indice === 0 ? 4 : 15) / k}>
              {linea}
            </tspan>
          ))}
        </text>
      ))}
    </g>
  );
}
