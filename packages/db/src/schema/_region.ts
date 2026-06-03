import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Regiones de residencia de datos soportadas. Enum (no text libre) para gobernar
 * el placement: no se admiten valores arbitrarios. Es la única fuente de verdad
 * del tipo; `region` se DENORMALIZA en cada tabla de negocio (viaja con el dato,
 * habilita routing/placement sin join y promover a SILO regional).
 *
 * Agregar una región = `ALTER TYPE region ADD VALUE '...'` (ver migración).
 */
export const regionEnum = pgEnum("region", [
  "us-east-1",
  "eu-central-1",
  "sa-east-1",
]);

export type Region = (typeof regionEnum.enumValues)[number];
