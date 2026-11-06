import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createDb, type Database } from "@nutreitor/db";
import type pg from "pg";

import { APP_ENV, type ApiEnv } from "../config/app-config.module.js";
import { APP_DB, CONTROL_DB } from "./database.constants.js";
import { TenantDbService } from "./tenant-db.service.js";
import { AdminDbService } from "./admin-db.service.js";

interface Pools {
  app: { db: Database; pool: pg.Pool };
  control: { db: Database; pool: pg.Pool } | null;
}

const DATABASE_POOLS = Symbol("DATABASE_POOLS");

/** Cierra los pools de Postgres al bajar la app (graceful shutdown). */
@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(DATABASE_POOLS) private readonly pools: Pools) {}

  async onModuleDestroy(): Promise<void> {
    await this.pools.app.pool.end();
    if (this.pools.control) {
      await this.pools.control.pool.end();
    }
  }
}

/**
 * Provee las dos conexiones del modelo POOL:
 *   - APP_DB     (rol app)     → sujeto a RLS, runtime de la API.
 *   - CONTROL_DB (rol control) → plano de control: entre tenants, sólo en las tablas
 *     de plataforma (ADR 0049). La API nunca tiene la conexión del owner.
 *
 * Mantenerlas como providers separados hace explícita la frontera de privilegio:
 * un servicio que inyecta CONTROL_DB declara, por tipo, que opera fuera del tenant.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOLS,
      useFactory: (env: ApiEnv): Pools => ({
        app: createDb(env.DATABASE_URL),
        control: env.DATABASE_CONTROL_URL ? createDb(env.DATABASE_CONTROL_URL) : null,
      }),
      inject: [APP_ENV],
    },
    {
      provide: APP_DB,
      useFactory: (pools: Pools): Database => pools.app.db,
      inject: [DATABASE_POOLS],
    },
    {
      provide: CONTROL_DB,
      useFactory: (pools: Pools): Database | null => pools.control?.db ?? null,
      inject: [DATABASE_POOLS],
    },
    DatabaseLifecycle,
    TenantDbService,
    AdminDbService,
  ],
  exports: [APP_DB, CONTROL_DB, TenantDbService, AdminDbService],
})
export class DatabaseModule {}
