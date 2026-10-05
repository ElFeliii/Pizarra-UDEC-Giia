import { PIN_RADIUS, escalaNota, postitSize, type Surface } from './constants';
import type { PinSummary } from './types';

export const ESPACIO_MODERACION =
  'Ese espacio está reservado para una nota del equipo. Elige un lugar cercano.';

/** Reserva el tamaño actual de la nota; el orden de dibujo también la protege si luego crece. */
export function invadeModeracion(
  nueva: { surface: Surface; x: number; y: number },
  notas: Iterable<PinSummary>,
): boolean {
  for (const nota of notas) {
    if (!nota.autorModerador || nota.surface !== nueva.surface) continue;
    const distancia = Math.hypot(nueva.x - nota.x, nueva.y - nota.y);
    const radio =
      nueva.surface === 'map'
        ? PIN_RADIUS.base * 0.55 * (escalaNota(nota.replyCount, nota.vistas) + 1) + 14
        : ((postitSize(nota.replyCount, nota.vistas) + postitSize(0, 0)) * Math.SQRT2) / 2 + 14;
    if (distancia < radio) return true;
  }
  return false;
}
