import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "@nutreitor/db";

import { APP_DB } from "../core/database/database.constants.js";

/**
 * Healthcheck. Público (sin tenant). `/health` para liveness y un ping a la DB
 * para readiness. Lo consume el healthcheck de docker-compose / el ALB a futuro.
 */
@Controller("health")
export class HealthController {
  constructor(@Inject(APP_DB) private readonly db: Database) {}

  @Get()
  async check(): Promise<{ status: string; db: "up" | "down" }> {
    let db: "up" | "down" = "down";
    try {
      await this.db.execute(sql`select 1`);
      db = "up";
    } catch {
      db = "down";
    }
    return { status: db === "up" ? "ok" : "degraded", db };
  }
}
