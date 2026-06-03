/** Token DI del enviador de mail (swappable por entorno). */
export const MAIL_SENDER = Symbol("MAIL_SENDER");

export interface InvitationEmail {
  to: string;
  /** Link de aceptación (lleva el token raw). */
  acceptUrl: string;
  orgName: string;
  role: string;
}

/**
 * Abstracción de envío de mail. En este sprint NO integramos proveedor real: el
 * adapter de dev loguea el link. El día de mañana se implementa un adapter SES/
 * Resend/etc. sin tocar los call sites.
 */
export interface MailSender {
  sendInvitation(email: InvitationEmail): Promise<void>;
}
