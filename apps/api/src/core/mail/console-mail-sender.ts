import { Injectable, Logger } from "@nestjs/common";

import type { InvitationEmail, MailSender } from "./mail-sender.js";

/**
 * Adapter de desarrollo: en vez de enviar un mail, loguea el link de aceptación
 * para poder probar el flujo end-to-end sin proveedor real.
 */
@Injectable()
export class ConsoleMailSender implements MailSender {
  private readonly logger = new Logger("MailSender");

  async sendInvitation(email: InvitationEmail): Promise<void> {
    this.logger.log(
      `[invitación] para ${email.to} (${email.role} @ ${email.orgName}) → ${email.acceptUrl}`,
    );
  }
}
