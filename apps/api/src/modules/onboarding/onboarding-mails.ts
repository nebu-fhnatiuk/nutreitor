import type { PlainEmail } from "../../core/mail/mail-sender.js";

/**
 * Textos de los mails del alta y de las decisiones de la plataforma (ADR 0025).
 * Sin datos de pacientes: sólo datos de la organización y links.
 */
const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

export function orgSignupMail(p: {
  to: string;
  fullName: string;
  orgName: string;
  link: string;
  hours: number;
}): PlainEmail {
  return {
    to: p.to,
    subject: `Confirmá tu email para crear ${p.orgName} en Nutreitor`,
    text:
      `Hola ${firstName(p.fullName)}:\n\n` +
      `Para terminar de crear ${p.orgName}, confirmá tu email desde este link ` +
      `(vence en ${p.hours} h):\n${p.link}\n\n` +
      `Si no fuiste vos, ignorá este mail: no se crea nada sin confirmar.\n`,
  };
}

export function platformNewOrgMail(p: {
  to: string;
  orgName: string;
  slug: string;
  kind: string;
  link: string;
}): PlainEmail {
  const tipo = p.kind === "individual" ? "profesional independiente" : "equipo";
  return {
    to: p.to,
    subject: `Nueva organización para revisar: ${p.orgName}`,
    text: `${p.orgName} (${p.slug}, ${tipo}) se registró y espera aprobación.\n\nRevisala en ${p.link}\n`,
  };
}

export function orgDecisionMail(p: {
  to: string;
  fullName: string;
  orgName: string;
  decision: "approve" | "reject" | "suspend" | "reactivate";
  note: string | null;
  link: string;
}): PlainEmail {
  const hola = `Hola ${firstName(p.fullName)}:\n\n`;
  const motivo = p.note ? `\nMotivo: ${p.note}\n` : "";
  switch (p.decision) {
    case "approve":
    case "reactivate":
      return {
        to: p.to,
        subject: `${p.orgName} ya está activa en Nutreitor`,
        text:
          hola +
          `Aprobamos ${p.orgName}. Tu vidriera ya es pública y podés invitar pacientes.\n\n` +
          `Entrá en ${p.link}\n`,
      };
    case "reject":
      return {
        to: p.to,
        subject: `No pudimos aprobar ${p.orgName}`,
        text: hola + `Revisamos la solicitud de ${p.orgName} y no pudimos aprobarla.\n${motivo}\nSi creés que es un error, respondé este mail.\n`,
      };
    case "suspend":
      return {
        to: p.to,
        subject: `${p.orgName} está suspendida`,
        text: hola + `Suspendimos ${p.orgName}: mientras tanto no se puede ingresar ni está pública.\n${motivo}\nRespondé este mail para resolverlo.\n`,
      };
  }
}

export function licenseDecisionMail(p: {
  to: string;
  fullName: string;
  orgName: string;
  decision: "reviewed" | "rejected";
  note: string | null;
  link: string;
}): PlainEmail {
  const hola = `Hola ${firstName(p.fullName)}:\n\n`;
  return p.decision === "reviewed"
    ? {
        to: p.to,
        subject: "Revisamos tu matrícula",
        text: hola + `Tu matrícula quedó revisada: tu perfil en ${p.orgName} ya puede ser público.\n\n${p.link}\n`,
      }
    : {
        to: p.to,
        subject: "Tenemos que revisar tu matrícula de nuevo",
        text:
          hola +
          `No pudimos validar la matrícula que cargaste en ${p.orgName}.\n\nMotivo: ${p.note ?? "—"}\n\n` +
          `Corregila desde tu perfil: ${p.link}\n`,
      };
}
