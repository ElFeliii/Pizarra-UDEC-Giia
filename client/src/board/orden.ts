import { escalaNota, type PinSummary } from '@pizarra/shared';

/** El equipo se dibuja al final, incluso frente a notas de asistentes que hayan crecido. */
export function ordenarPines(a: PinSummary, b: PinSummary): number {
  return (
    Number(!!a.autorModerador) - Number(!!b.autorModerador) ||
    escalaNota(b.replyCount, b.vistas) - escalaNota(a.replyCount, a.vistas) ||
    a.id - b.id
  );
}
