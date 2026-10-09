import {
  ESTADOS_SECCION,
  SECCION_DE_SUPERFICIE,
  TIPOS_SECCION,
  type EstadoSeccion,
  type Seccion,
  type Surface,
} from '@pizarra/shared';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getMeta, setMeta } from '../db/db';

const semillaSchema = z.object({
  version: z.number().int().positive(),
  secciones: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        tipo: z.enum(TIPOS_SECCION),
        nombre: z.string().min(2).max(60),
        orden: z.number().int(),
        estado: z.enum(ESTADOS_SECCION),
      }),
    )
    .min(1),
});

/**
 * Carga la semilla de secciones. Solo agrega las que faltan: el estado que haya dejado el
 * moderador se respeta siempre. Al subir la versión del archivo, las bases existentes reciben
 * las secciones nuevas. Mismo patrón que la lista de palabras.
 */
export function seedSecciones(ctx: AppContext, path: string): number {
  const semilla = semillaSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const previa = Number(getMeta(ctx.db, 'secciones_version') ?? 0);
  if (previa >= semilla.version) return 0;
  const nuevas = ctx.repos.secciones.addMissing(semilla.secciones, ctx.now());
  setMeta(ctx.db, 'secciones_version', String(semilla.version));
  return nuevas;
}

/**
 * Los dos momentos del evento, en un botón. No se inventan estados: se listan las secciones
 * que cambian, y lo que no se nombra se queda como esté.
 */
export const PRESETS = {
  universitarios: {
    nombre: 'Modo universitarios',
    descripcion: 'Antes de puertas abiertas: los universitarios llenan las secciones de texto.',
    estados: {
      mapa: 'abierta',
      pizarra: 'abierta',
      consejos: 'abierta',
      historias: 'abierta',
      carreras: 'abierta',
      faq: 'abierta',
    },
  },
  'puertas-abiertas': {
    nombre: 'Modo puertas abiertas',
    descripcion: 'El día del evento: lo que escribieron los universitarios queda para leer.',
    estados: {
      mapa: 'abierta',
      pizarra: 'abierta',
      consejos: 'solo_lectura',
      historias: 'solo_lectura',
      carreras: 'solo_lectura',
      faq: 'solo_lectura',
    },
  },
} as const satisfies Record<
  string,
  { nombre: string; descripcion: string; estados: Record<string, EstadoSeccion> }
>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as [PresetId, ...PresetId[]];

export function listarSecciones(ctx: AppContext): Seccion[] {
  return ctx.repos.secciones.list();
}

/** Las secciones que ve un asistente: las ocultas no existen para él. */
export function seccionesVisibles(ctx: AppContext): Seccion[] {
  return ctx.repos.secciones.list().filter((s) => s.estado !== 'oculta');
}

/** true si en esa sección se puede publicar ahora mismo. */
export function seccionAbierta(ctx: AppContext, id: string): boolean {
  return ctx.repos.secciones.get(id)?.estado === 'abierta';
}

/** La sección a la que pertenece un pin de la pizarra o del mapa. */
export function seccionDeSuperficie(surface: Surface): string {
  return SECCION_DE_SUPERFICIE[surface];
}

function cambiarEstadoConConteo(
  ctx: AppContext,
  id: string,
  estado: EstadoSeccion,
): Seccion | undefined {
  return ctx.db.transaction(() => {
    const anterior = ctx.repos.secciones.get(id);
    const cambiaVisibilidad = (anterior?.estado === 'oculta') !== (estado === 'oculta');
    const textos = cambiaVisibilidad ? ctx.repos.wordCounts.textosVisibles({ seccion: id }) : [];
    const seccion = ctx.repos.secciones.setEstado(id, estado, ctx.now());
    if (seccion && cambiaVisibilidad) {
      ctx.topWords.ajustarVisibilidad(textos, ctx.repos.wordCounts.textosVisibles({ seccion: id }));
    }
    return seccion;
  })();
}

/** Cambia el estado de una sección y lo avisa a todos los navegadores abiertos. */
export function cambiarEstado(
  ctx: AppContext,
  id: string,
  estado: EstadoSeccion,
  moderador: string,
): Seccion | undefined {
  const seccion = cambiarEstadoConConteo(ctx, id, estado);
  if (!seccion) return undefined;
  ctx.broadcaster.seccionChanged(seccion);
  ctx.repos.modLog.add({
    moderator: moderador,
    action: 'seccion.estado',
    detail: `${id}: ${estado}`,
    now: ctx.now(),
  });
  return seccion;
}

/** Aplica un momento completo. Devuelve solo las secciones que de verdad cambiaron. */
export function aplicarPreset(ctx: AppContext, preset: PresetId, moderador: string): Seccion[] {
  const cambiadas: Seccion[] = [];
  for (const [id, estado] of Object.entries(PRESETS[preset].estados)) {
    const seccion = cambiarEstadoConConteo(ctx, id, estado);
    if (seccion) {
      cambiadas.push(seccion);
      ctx.broadcaster.seccionChanged(seccion);
    }
  }
  ctx.repos.modLog.add({
    moderator: moderador,
    action: 'seccion.preset',
    detail: `${preset}: ${cambiadas.length} secciones`,
    now: ctx.now(),
  });
  return cambiadas;
}
