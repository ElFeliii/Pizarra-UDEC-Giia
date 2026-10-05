import { z } from 'zod';
import { isInsideCampus, OUTSIDE_CAMPUS_MESSAGE } from './campusArea';
import { BOARD_SIZE, LIMITS, OTHER_INSTITUTION_ID, PIN_COLOR_IDS, SURFACES } from './constants';

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .trim()
    .min(min, {
      error:
        min <= 1
          ? `${label} no puede estar vacío`
          : `${label} debe tener al menos ${min} caracteres`,
    })
    .max(max, { error: `${label} puede tener como máximo ${max} caracteres` });

export const sessionInputSchema = z
  .object({
    name: text(LIMITS.name.min, LIMITS.name.max, 'El nombre'),
    institutionId: z.string().min(1, { error: 'Elige una institución' }).max(64),
    institutionOther: z.string().trim().max(LIMITS.institutionOther.max).optional(),
  })
  .refine(
    (v) =>
      v.institutionId !== OTHER_INSTITUTION_ID ||
      (v.institutionOther?.length ?? 0) >= LIMITS.institutionOther.min,
    { error: 'Escribe el nombre de tu institución', path: ['institutionOther'] },
  );
export type SessionInput = z.infer<typeof sessionInputSchema>;

const coord = z.number().finite().min(0).max(BOARD_SIZE);

export const pinInputSchema = z
  .object({
    surface: z.enum(SURFACES).default('board'),
    x: coord,
    y: coord,
    color: z.enum(PIN_COLOR_IDS, { error: 'Color no válido' }),
    text: text(LIMITS.pin.min, LIMITS.pin.max, 'La nota'),
  })
  .superRefine((v, ctx) => {
    // En el mapa el pin tiene que caer dentro del contorno del campus, no solo del lienzo.
    if (v.surface === 'map' && !isInsideCampus(v.x, v.y)) {
      ctx.addIssue({ code: 'custom', message: OUTSIDE_CAMPUS_MESSAGE, path: ['x'] });
    }
  });
export type PinInput = z.input<typeof pinInputSchema>;

const id = z.number().int().positive();

export const replyInputSchema = z.object({
  pinId: id,
  text: text(LIMITS.reply.min, LIMITS.reply.max, 'La respuesta'),
});
export type ReplyInput = z.infer<typeof replyInputSchema>;

export const reportInputSchema = z.object({
  targetType: z.enum(['pin', 'reply']),
  targetId: id,
  reason: z.string().trim().max(LIMITS.reportReason.max).optional(),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

export const threadRefSchema = z.object({ pinId: id });

/**
 * Nota de un muro (Consejos, Historias…). A diferencia de la pizarra y el mapa, acá la nota no
 * tiene lugar: es una tarjeta en una lista.
 */
export const notaInputSchema = z.object({
  seccion: z.string().regex(/^[a-z0-9-]+$/),
  temaId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(160)
    .optional(),
  color: z.enum(PIN_COLOR_IDS),
  text: text(LIMITS.pin.min, LIMITS.pin.max, 'La nota'),
});
export type NotaInput = z.infer<typeof notaInputSchema>;

/** Aviso de que alguien abrió una nota. `visitante` es el id anónimo del navegador. */
export const vistaInputSchema = z.object({
  pinId: id,
  visitante: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Identificador no válido'),
});
export type VistaInput = z.infer<typeof vistaInputSchema>;

export const preguntaInputSchema = z.object({
  nombre: text(3, 200, 'La pregunta'),
});

export const modLoginSchema = z.object({
  password: z.string().min(1).max(200),
  moderatorName: text(LIMITS.moderatorName.min, LIMITS.moderatorName.max, 'El nombre'),
});

export const bannedWordInputSchema = z.object({
  term: text(LIMITS.bannedTerm.min, LIMITS.bannedTerm.max, 'La palabra'),
  mode: z.enum(['exact', 'prefix', 'contains']),
});

/** Primer mensaje de error legible de un resultado zod fallido. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos no válidos';
}
