import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module.js";
import { APP_ENV, type ApiEnv } from "./core/config/app-config.module.js";
import { edgeSecretMiddleware } from "./core/security/edge-secret.middleware.js";
import { TenantContextMiddleware } from "./core/tenant/tenant.middleware.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = app.get<ApiEnv>(APP_ENV);

  // Cierra pools de Postgres en SIGTERM/SIGINT (dispara onModuleDestroy).
  app.enableShutdownHooks();

  // Borde: exige el secreto compartido edge↔API (salvo /health). Primero de todo,
  // antes de parsear cookies o abrir scopes.
  app.use(edgeSecretMiddleware(env));

  // JSON de hasta 3 MB: el import de deportistas manda el CSV entero (hasta 1 MB
  // de texto, KAN-42). El default de Express (100 KB) cortaba un archivo de ~1000 filas.
  app.useBodyParser("json", { limit: "3mb" });

  // Parsea cookies (access_token / refresh_token) para el flujo de auth.
  app.use(cookieParser());

  // Abre el scope de AsyncLocalStorage para CADA request, antes de guards y
  // controllers. Registrado como middleware global para evitar wildcards de ruta.
  const tenantMiddleware = new TenantContextMiddleware();
  app.use(tenantMiddleware.use.bind(tenantMiddleware));

  // CORS para el front en dev (Next.js).
  app.enableCors({ origin: true, credentials: true });

  await app.listen(env.API_PORT, "0.0.0.0");
  console.log(`API escuchando en http://0.0.0.0:${env.API_PORT}`);
}

void bootstrap();
