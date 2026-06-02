import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module.js";
import { APP_ENV, type ApiEnv } from "./core/config/app-config.module.js";
import { TenantContextMiddleware } from "./core/tenant/tenant.middleware.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Cierra pools de Postgres en SIGTERM/SIGINT (dispara onModuleDestroy).
  app.enableShutdownHooks();

  // Parsea cookies (access_token / refresh_token) para el flujo de auth.
  app.use(cookieParser());

  // Abre el scope de AsyncLocalStorage para CADA request, antes de guards y
  // controllers. Registrado como middleware global para evitar wildcards de ruta.
  const tenantMiddleware = new TenantContextMiddleware();
  app.use(tenantMiddleware.use.bind(tenantMiddleware));

  // CORS para el front en dev (Next.js).
  app.enableCors({ origin: true, credentials: true });

  const env = app.get<ApiEnv>(APP_ENV);
  await app.listen(env.API_PORT, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`API escuchando en http://0.0.0.0:${env.API_PORT}`);
}

void bootstrap();
