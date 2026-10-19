import type { PlainEmail } from "../../core/mail/mail-sender.js";

/**
 * Mails al visitante que pidió contacto (ADR 0027). No repiten lo que escribió (el
 * mail puede leerlo otra persona) ni llevan notas internas del profesional.
 */
const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

export function contactReceivedMail(p: {
  to: string;
  fullName: string;
  recipientName: string;
  orgName: string;
}): PlainEmail {
  const para = p.recipientName === p.orgName ? p.orgName : `${p.recipientName} (${p.orgName})`;
  return {
    to: p.to,
    subject: `Recibimos tu consulta para ${p.recipientName}`,
    text:
      `Hola ${firstName(p.fullName)}:\n\n` +
      `Le hicimos llegar tu consulta a ${para}. Te van a responder a este email.\n\n` +
      `Si no la mandaste vos, ignorá este mensaje.\n`,
  };
}

export function contactDeclinedMail(p: { to: string; fullName: string; orgName: string }): PlainEmail {
  return {
    to: p.to,
    subject: `Sobre tu consulta a ${p.orgName}`,
    text:
      `Hola ${firstName(p.fullName)}:\n\n` +
      `Gracias por escribirnos. Por ahora no podemos tomar tu consulta en ${p.orgName}.\n` +
      `Te recomendamos buscar otro profesional que pueda acompañarte.\n`,
  };
}
