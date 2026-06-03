import { z } from "zod";

/**
 * Regiones de residencia de datos. Espeja el `regionEnum` de @nutreitor/db
 * (shared no depende de db). Mantener en sync con la migración del enum.
 */
export const regions = ["us-east-1", "eu-central-1", "sa-east-1"] as const;

export type Region = (typeof regions)[number];

export const regionSchema = z.enum(regions);
