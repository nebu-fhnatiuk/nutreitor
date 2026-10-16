import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

import { APP_ENV, type ApiEnv } from "../config/app-config.module.js";
import {
  checkRateLimit,
  type CounterStore,
  type RateLimitRule,
  type RateLimitVerdict,
} from "./rate-limiter.js";

/** INCR + EXPIRE NX en una transacción: la ventana arranca con el primer hit. */
export class RedisCounterStore implements CounterStore {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowSec: number): Promise<number> {
    const res = await this.redis.multi().incr(key).expire(key, windowSec, "NX").exec();
    const [err, count] = res?.[0] ?? [new Error("MULTI sin resultado"), null];
    if (err) throw err;
    return Number(count);
  }
}

/**
 * Fachada del limitador. FAIL-OPEN: si Redis no está o no responde, se deja pasar
 * el request (y se loguea). El rate-limit es una capa de protección, no de
 * corrección; tumbar el login porque se cayó Redis sería peor que el riesgo que
 * cubre. Sin `REDIS_URL` (dev/test) queda apagado; en prod la env lo exige.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis | null;
  private readonly store: CounterStore | null;

  constructor(@Inject(APP_ENV) env: ApiEnv) {
    if (!env.REDIS_URL) {
      this.logger.warn("REDIS_URL no configurado: rate-limiting APAGADO.");
      this.redis = null;
      this.store = null;
      return;
    }
    this.redis = new Redis(env.REDIS_URL, {
      // Sin cola offline ni reintentos largos: si Redis no está, el comando falla
      // en el acto y el request sigue (fail-open) en vez de quedar colgado.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 250,
    });
    this.redis.on("error", (e: Error) => this.logger.warn(`Redis: ${e.message}`));
    this.store = new RedisCounterStore(this.redis);
  }

  async check(rule: RateLimitRule, subject: string): Promise<RateLimitVerdict> {
    if (!this.store) return { ok: true, retryAfterSec: 0 };
    try {
      return await checkRateLimit(this.store, rule, subject);
    } catch (e) {
      this.logger.warn(`Rate-limit fail-open (${rule.name}): ${(e as Error).message}`);
      return { ok: true, retryAfterSec: 0 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }
}
