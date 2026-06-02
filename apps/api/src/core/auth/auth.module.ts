import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { JwtStrategy } from "./strategies/jwt.strategy.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

/**
 * Autenticación self-hosted. El secreto de firma se pasa por-operación en
 * AuthService/JwtStrategy desde el env validado, así que JwtModule alcanza con
 * el registro vacío. AdminDbService (rol owner) llega vía DatabaseModule (global).
 *
 * El día de mañana el IdP cambia el verificador; el contrato (guards, roles, ALS)
 * no se toca.
 */
@Module({
  imports: [PassportModule.register({ session: false }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TenantResolverService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, TenantResolverService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
