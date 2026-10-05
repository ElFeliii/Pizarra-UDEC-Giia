/**
 * Incitación al odio por frase.
 *
 * La lista de palabras no alcanza aquí: "maten a los judíos" no tiene ninguna palabra
 * prohibida, el daño está en la combinación. Este módulo busca un verbo de violencia o de
 * expulsión cerca de un colectivo, en cualquiera de los dos órdenes.
 */

import { matchCandidates, type Candidates } from './normalize';

/** Distancia máxima, en palabras, entre el verbo y el colectivo. */
const VENTANA = 4;

/** Verbos de matar, dañar o echar. Ya normalizados (minúsculas, sin tildes). */
const VIOLENCIA = new Set([
  'matar',
  'maten',
  'matenlos',
  'matenlas',
  'matemos',
  'mata',
  'mate',
  'matalos',
  'matarlos',
  'asesinar',
  'asesinen',
  'asesinemos',
  'mueran',
  'muera',
  'muerte',
  'muerta',
  'muertos',
  'morir',
  'moriran',
  'exterminar',
  'exterminen',
  'exterminio',
  'eliminar',
  'eliminen',
  'quemar',
  'quemen',
  'quemarlos',
  'gasear',
  'gaseen',
  'linchar',
  'linchen',
  'fusilar',
  'fusilen',
  'colgar',
  'cuelguen',
  'ahorcar',
  'ahorquen',
  'apalear',
  'apaleen',
  'golpear',
  'golpeen',
  'violar',
  'violen',
  'odio',
  'odiamos',
  'erradicar',
  'erradiquen',
  'limpiar',
  // Expulsión
  'fuera',
  'echen',
  'echar',
  'expulsar',
  'expulsen',
  'deportar',
  'deporten',
  'largo',
  'larguense',
  'vayanse',
  'devuelvanse',
  'vuelvanse',
  'sobran',
  'sobra',
]);

/**
 * Colectivos, siempre en plural o como gentilicio: así "el gato negro" no dispara nada y
 * "los negros" sí. Incluye origen, religión, orientación, género, discapacidad y política.
 */
const COLECTIVOS = new Set([
  // Origen y etnia
  'judios',
  'judias',
  'negros',
  'negras',
  'latinos',
  'latinas',
  'sudacas',
  'indios',
  'indigenas',
  'mapuches',
  'mapuche',
  'aymaras',
  'gitanos',
  'moros',
  'arabes',
  'turcos',
  'chinos',
  'chinas',
  'asiaticos',
  'coreanos',
  'japoneses',
  'africanos',
  'haitianos',
  'venezolanos',
  'venecos',
  'peruanos',
  'perucas',
  'bolivianos',
  'colombianos',
  'ecuatorianos',
  'argentinos',
  'brasileros',
  'brasileños',
  'mexicanos',
  'gringos',
  'extranjeros',
  'inmigrantes',
  'migrantes',
  'refugiados',
  'ilegales',
  // Religión
  'musulmanes',
  'islamicos',
  'cristianos',
  'catolicos',
  'evangelicos',
  'protestantes',
  'mormones',
  'ateos',
  'sionistas',
  // Orientación e identidad
  'gays',
  'gais',
  'homosexuales',
  'lesbianas',
  'bisexuales',
  'transexuales',
  'travestis',
  'trans',
  'maricones',
  'maricas',
  'fletos',
  'colipatos',
  // Género
  'mujeres',
  'hombres',
  'feministas',
  'machistas',
  'feminazis',
  // Condición
  'discapacitados',
  'invalidos',
  'autistas',
  'sordos',
  'ciegos',
  'enfermos',
  'pobres',
  'mendigos',
  'drogadictos',
  'vagos',
  'flaites',
  // Política
  'comunistas',
  'fascistas',
  'facistas',
  'fachos',
  'nazis',
  'zurdos',
  'momios',
  'anarquistas',
]);

/** Verbo de violencia y colectivo a menos de `VENTANA` palabras, en cualquier orden. */
function incita(seq: string[]): boolean {
  for (let i = 0; i < seq.length; i++) {
    const aqui = seq[i]!;
    const esVerbo = VIOLENCIA.has(aqui);
    const esGrupo = COLECTIVOS.has(aqui);
    if (!esVerbo && !esGrupo) continue;
    const hasta = Math.min(seq.length, i + VENTANA + 1);
    for (let j = i + 1; j < hasta; j++) {
      const otro = seq[j]!;
      if (esVerbo && COLECTIVOS.has(otro)) return true;
      if (esGrupo && VIOLENCIA.has(otro)) return true;
    }
  }
  return false;
}

/** true si el texto llama a hacerle daño a un grupo de personas. */
export function incitesHate(text: string): boolean;
export function incitesHate(candidates: Candidates): boolean;
export function incitesHate(entrada: string | Candidates): boolean {
  const c = typeof entrada === 'string' ? matchCandidates(entrada) : entrada;
  return c.sequences.some(incita);
}
