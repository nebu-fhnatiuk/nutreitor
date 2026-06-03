import { z } from "zod";

import { regionSchema, type Region } from "../region.js";

/** Alta de organización (operación de administración, corre con rol owner). */
export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug inválido (kebab-case, sin acentos)"),
  // Valida contra el set de regiones soportadas (espeja el enum de la DB).
  region: regionSchema,
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  region: Region;
  createdAt: string;
}
