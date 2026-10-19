import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { passwordResets, refreshTokens, users } from "@nutreitor/db";
import type { PasswordResetPreview } from "@nutreitor/shared";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";

import { APP_ENV, type ApiEnv } from "../config/app-config.module.js";
import { generateToken, hashToken } from "../crypto/tokens.js";
import { AdminDbService } from "../database/admin-db.service.js";
import { MAIL_SENDER, type MailSender } from "../mail/mail-sender.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

/**
 * Recuperar la contraseña (ADR 0029). La identidad es GLOBAL: una persona tiene una
 * contraseña para todas sus organizaciones (y la consola), así que restablecerla la
 * cambia en todas. Plano de control: conexión owner, como el resto del pre-auth.
 *
 *  - `request`: siempre la misma respuesta (no revela si el email tiene cuenta). Si
 *    la tiene, link de un solo uso que vence en `PASSWORD_RESET_TTL_MIN`, que vuelve
 *    a donde se pidió (el subdominio de la org, o el dominio raíz).
 *  - `reset`: reclamo atómico del token, nueva contraseña, `password_changed_at`, se
 *    anulan los otros links abiertos y se revocan todas las sesiones (refresh).
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger("PasswordReset");

  constructor(
    private readonly admin: AdminDbService,
    private readonly tenantResolver: TenantResolverService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  async request(email: string, slug: string | undefined): Promise<void> {
    const [user] = await this.admin.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!user) return; // misma respuesta: no se confirma si existe

    // El link vuelve al subdominio desde el que se pidió, si es una org real.
    const org = slug ? await this.tenantResolver.bySlug(slug) : null;
    const origin = org ? this.env.WEB_ORIGIN_TEMPLATE.replace("{slug}", org.slug) : this.env.WEB_ROOT_ORIGIN;

    const raw = generateToken();
    await this.admin.db.insert(passwordResets).values({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + this.env.PASSWORD_RESET_TTL_MIN * 60_000),
    });
    try {
      await this.mail.send({
        to: user.email,
        subject: "Restablecé tu contraseña de Nutreitor",
        text:
          `Hola ${user.fullName.split(/\s+/)[0]}:\n\n` +
          `Pediste restablecer tu contraseña. Elegí una nueva desde este link ` +
          `(vence en ${this.env.PASSWORD_RESET_TTL_MIN} minutos y sirve una sola vez):\n` +
          `${origin}/restablecer?token=${raw}\n\n` +
          `Es la misma contraseña para todos tus espacios en Nutreitor.\n` +
          `Si no lo pediste vos, ignorá este mail: tu contraseña no cambia.\n`,
      });
    } catch (err) {
      this.logger.warn(`No se pudo mandar el mail de recuperación: ${(err as Error).message}`);
    }
  }

  async lookup(token: string | undefined): Promise<PasswordResetPreview> {
    if (!token) throw invalidLink();
    const [row] = await this.admin.db
      .select({ email: users.email })
      .from(passwordResets)
      .innerJoin(users, eq(users.id, passwordResets.userId))
      .where(this.open(token))
      .limit(1);
    if (!row) throw invalidLink();
    return { email: row.email };
  }

  async reset(token: string, password: string): Promise<PasswordResetPreview> {
    const hashed = bcrypt.hashSync(password, 10);
    return this.admin.db.transaction(async (tx) => {
      // Reclamo atómico: sólo un uso, aunque lleguen dos a la vez.
      const [claimed] = await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(this.open(token))
        .returning({ userId: passwordResets.userId });
      if (!claimed) throw invalidLink();

      const now = new Date();
      const [u] = await tx
        .update(users)
        .set({ hashedPassword: hashed, passwordChangedAt: now })
        .where(eq(users.id, claimed.userId))
        .returning({ email: users.email });
      // Otros links abiertos de la misma cuenta dejan de servir.
      await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(and(eq(passwordResets.userId, claimed.userId), isNull(passwordResets.usedAt)));
      // Cerrar todas las sesiones: quien tuviera la contraseña vieja queda afuera.
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, claimed.userId), isNull(refreshTokens.revokedAt)));
      return { email: u!.email };
    });
  }

  private open(token: string) {
    return and(
      eq(passwordResets.tokenHash, hashToken(token)),
      isNull(passwordResets.usedAt),
      gt(passwordResets.expiresAt, new Date()),
    );
  }
}

const invalidLink = () =>
  new BadRequestException("El link es inválido o venció. Pedí uno nuevo.");
