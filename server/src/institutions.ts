import { OTHER_INSTITUTION_ID, type Institution } from '@pizarra/shared';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const fileSchema = z
  .array(
    z.object({
      id: z
        .string()
        .regex(/^[a-z0-9-]+$/, 'El id solo puede tener minúsculas, números y guiones')
        .refine(
          (id) => id !== OTHER_INSTITUTION_ID,
          `El id "${OTHER_INSTITUTION_ID}" está reservado`,
        ),
      name: z.string().min(2).max(120),
      type: z.enum(['colegio', 'universidad']),
      comuna: z.string().min(2).max(60).optional(),
    }),
  )
  .refine((list) => new Set(list.map((i) => i.id)).size === list.length, 'Hay ids repetidos');

export interface InstitutionCatalog {
  list: Institution[];
  get(id: string): Institution | undefined;
}

/** Lee la lista editable de instituciones y agrega al final la opción "Otra". */
export function loadInstitutions(path: string): InstitutionCatalog {
  const parsed = fileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const sorted = [...parsed].sort(
    (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'es'),
  );
  const list: Institution[] = [...sorted, { id: OTHER_INSTITUTION_ID, name: 'Otra', type: 'otra' }];
  const byId = new Map(list.map((i) => [i.id, i]));
  return { list, get: (id) => byId.get(id) };
}
