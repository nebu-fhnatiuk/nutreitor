import { Module } from "@nestjs/common";

/**
 * Módulo de tenant. El middleware se registra a nivel app (app.module) para
 * cubrir todas las rutas; este módulo agrupa lo relacionado a tenant si crece
 * (resolvers de slug→tenant, etc.).
 */
@Module({})
export class TenantModule {}
