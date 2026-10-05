import { campus, type Building } from './campus';

/** Sin tildes y en minúsculas, para que "biologia" encuentre "Biológicas". */
function plano(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Letras iniciales que comparten dos palabras. */
function prefijoComun(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Desde aquí, dos palabras con el mismo comienzo se consideran la misma ("biolog|ia/icas"). */
const RAIZ_MINIMA = 5;

/**
 * Puntaje de una coincidencia, de mejor a peor: el nombre empieza con lo buscado, una palabra
 * del nombre empieza con lo buscado, aparece en cualquier parte, o comparte raíz con alguna
 * palabra del nombre (así "biologia" encuentra "Biológicas"). -1 si no calza.
 */
function puntaje(nombre: string, aguja: string): number {
  if (nombre.startsWith(aguja)) return 0;
  const i = nombre.indexOf(aguja);
  if (i !== -1) return nombre[i - 1] === ' ' || nombre[i - 1] === '(' ? 1 : 2;
  if (aguja.length >= RAIZ_MINIMA && !aguja.includes(' ')) {
    for (const palabra of nombre.split(/[^a-zñ0-9]+/)) {
      if (prefijoComun(palabra, aguja) >= RAIZ_MINIMA) return 3;
    }
  }
  return -1;
}

/**
 * Busca edificios del campus por nombre. Es una búsqueda local: la lista son 85 nombres, no
 * vale la pena ir al servidor por esto.
 */
export function buscarEdificios(consulta: string, limite = 6): Building[] {
  return buscarPorNombre(
    consulta,
    campus.buildings,
    (edificio) => edificio.name,
    (a, b) => b.area - a.area,
    limite,
  );
}

/** El mismo buscador sirve para carreras, sin duplicar las reglas de tildes y terminaciones. */
export function buscarPorNombre<T>(
  consulta: string,
  elementos: readonly T[],
  nombre: (elemento: T) => string,
  desempatar: (a: T, b: T) => number,
  limite = elementos.length,
): T[] {
  const aguja = plano(consulta.trim());
  if (aguja.length < 2) return [];
  return elementos
    .map((elemento) => ({ elemento, valor: puntaje(plano(nombre(elemento)), aguja) }))
    .filter((resultado) => resultado.valor >= 0)
    .sort((a, b) => a.valor - b.valor || desempatar(a.elemento, b.elemento))
    .slice(0, limite)
    .map((resultado) => resultado.elemento);
}
