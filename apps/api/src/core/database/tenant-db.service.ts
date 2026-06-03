import { Inject, Injectable } from "@nestjs/common";
import { withTenant, type Database, type TenantTx } from "@nutreitor/db";
import type { TenantContext } from "@nutreitor/shared";

import { getTenantContext } from "../tenant/tenant-context.store.js";
import { APP_DB } from "./database.constants.js";

/**
 * Servicio de acceso a datos tenant-scoped.
 *
 * SINGLETON (no request-scoped). Lee el TenantContext del AsyncLocalStorage y, en
 * cada operación, abre una transacción que inyecta `app.current_tenant_id` vía
 * `SET LOCAL` antes de ejecutar el callback. La policy RLS hace cumplir el
 * aislamiento; este servicio sólo garantiza que SIEMPRE haya contexto seteado.
 *
 * Toda lectura/escritura de tablas de negocio debe pasar por `run()`.
 */
@Injectable()
export class TenantDbService {
  constructor(@Inject(APP_DB) private readonly db: Database) {}

  /** Contexto de tenant del request actual (tira si no está autenticado). */
  get context(): TenantContext {
    return getTenantContext();
  }

  /**
   * Ejecuta `cb` dentro de una transacción con el tenant del contexto (ALS)
   * inyectado. El `tx` ya está acotado por RLS al tenant autenticado.
   */
  run<T>(cb: (tx: TenantTx) => PromiseLike<T>): Promise<T> {
    return withTenant(this.db, this.context.tenantId, cb);
  }

  /**
   * Igual que `run()` pero con el `tenantId` EXPLÍCITO en vez de tomarlo del ALS.
   * Para flujos sin sesión (lectura pública): se resuelve la org del slug (bootstrap)
   * y se corre la query bajo RLS con ese tenant. MISMA arquitectura de aislamiento
   * que `run()` (pool app + SET LOCAL + RLS); no hay ruta exenta de RLS.
   */
  runAs<T>(tenantId: string, cb: (tx: TenantTx) => PromiseLike<T>): Promise<T> {
    return withTenant(this.db, tenantId, cb);
  }
}
