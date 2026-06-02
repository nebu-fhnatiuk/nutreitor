import { z } from "zod";

/** Alta de organización (operación de administración, corre con rol owner). */
export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug inválido (kebab-case, sin acentos)"),
  region: z.string().min(1),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  region: string;
  createdAt: string;
}
