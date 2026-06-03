import { Global, Module } from "@nestjs/common";

import { ConsoleMailSender } from "./console-mail-sender.js";
import { MAIL_SENDER } from "./mail-sender.js";

/**
 * Mail. Global: el adapter se inyecta por token `MAIL_SENDER`. En dev es el
 * ConsoleMailSender; cambiar a un proveedor real es cambiar este `useClass`.
 */
@Global()
@Module({
  providers: [{ provide: MAIL_SENDER, useClass: ConsoleMailSender }],
  exports: [MAIL_SENDER],
})
export class MailModule {}
