import type { Building } from './campus';

export interface Rotulo {
  edificio: Building;
  lineas: string[];
  caja: { izquierda: number; derecha: number; arriba: number; abajo: number };
}

/** Se conserva el nombre completo en búsqueda y ficha; el plano necesita rótulos breves. */
export function lineasDelRotulo(nombre: string, limite: number): string[] {
  const palabras = nombre.split(/\s+/);
  const lineas: string[] = [];
  let linea = '';
  for (const palabra of palabras) {
    const siguiente = linea ? `${linea} ${palabra}` : palabra;
    if (siguiente.length > limite && linea) {
      lineas.push(linea);
      linea = palabra;
    } else linea = siguiente;
  }
  if (linea) lineas.push(linea);
  return lineas
    .slice(0, 2)
    .map((texto, indice) =>
      texto.length > limite || (indice === 1 && lineas.length > 2)
        ? `${texto.slice(0, limite - 1).trimEnd()}…`
        : texto,
    );
}

const REFERENCIAS = ['campanil', 'biblioteca-central', 'casa-del-arte', 'casa-del-deporte', 'arco'];

/** Evita cruces entre rótulos en píxeles de pantalla, conservando referencias al alejarse. */
export function seleccionarRotulos(
  edificios: readonly Building[],
  zoom: number,
  compacto: boolean,
  seleccionado: string | null = null,
  areaMinima = 150,
  zoomMinimo = 0.3,
): Rotulo[] {
  if (zoom < zoomMinimo) return [];
  const referencia = (edificio: Building) =>
    REFERENCIAS.some((nombre) => edificio.id.includes(nombre));
  const prioridad = (edificio: Building) =>
    edificio.id === seleccionado ? 2 : referencia(edificio) ? 1 : 0;
  const umbral = areaMinima * Math.max(1, ((compacto ? 1.3 : 1.1) / zoom) ** 2);
  const candidatos = edificios
    .filter((edificio) => prioridad(edificio) > 0 || edificio.area >= umbral)
    .sort((a, b) => prioridad(b) - prioridad(a) || b.area - a.area || a.id.localeCompare(b.id));
  const aceptados: Rotulo[] = [];
  const fuente = compacto ? 11.5 : 12;
  for (const edificio of candidatos) {
    const lineas = lineasDelRotulo(edificio.name, compacto ? 25 : 32);
    const ancho = (Math.max(...lineas.map((linea) => linea.length)) * fuente * 0.64 + 16) / zoom;
    const alto = (lineas.length * 15 + 12) / zoom;
    const caja = {
      izquierda: edificio.cx - ancho / 2,
      derecha: edificio.cx + ancho / 2,
      arriba: edificio.cy - alto / 2,
      abajo: edificio.cy + alto / 2,
    };
    if (
      aceptados.some(
        ({ caja: otra }) =>
          caja.izquierda < otra.derecha &&
          caja.derecha > otra.izquierda &&
          caja.arriba < otra.abajo &&
          caja.abajo > otra.arriba,
      )
    )
      continue;
    aceptados.push({ edificio, lineas, caja });
  }
  return aceptados;
}
