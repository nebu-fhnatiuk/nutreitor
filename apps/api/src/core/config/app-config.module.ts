import { Global, Module } from "@nestjs/common";
import { apiEnvSchema, parseEnv, type ApiEnv } from "@nutreitor/config/env";

/** Token de inyección para el entorno validado. */
export const APP_ENV = Symbol("APP_ENV");

/**
 * Módulo global que valida el entorno UNA vez al boot (fail-fast) y lo expone
 * tipado vía DI. Cualquier provider puede inyectar `@Inject(APP_ENV) env: ApiEnv`.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: (): ApiEnv => parseEnv(apiEnvSchema),
    },
  ],
  exports: [APP_ENV],
})
export class AppConfigModule {}

export type { ApiEnv };
