import { DateTime } from "luxon";

/**
 * Textos de los avisos. Sin datos clínicos: el turno lleva fecha, hora y
 * profesional; el aviso de mensaje NO incluye el contenido (ADR 0023).
 */
export interface Rendered {
  subject: string;
  text: string;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/** "hoy" / "mañana" / "el jueves 23 de octubre" según la fecha local. */
export function relativeDay(when: DateTime, now: DateTime): string {
  const d = when.startOf("day").diff(now.setZone(when.zone).startOf("day"), "days").days;
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  return `el ${when.setLocale("es-AR").toFormat("cccc d 'de' LLLL")}`;
}

export function appointmentReminder(p: {
  patientName: string;
  professionalName: string;
  orgName: string;
  startsAt: Date;
  timezone: string;
  now: Date;
  link: string;
}): Rendered {
  const when = DateTime.fromJSDate(p.startsAt).setZone(p.timezone);
  const day = relativeDay(when, DateTime.fromJSDate(p.now));
  const time = when.toFormat("HH:mm");
  return {
    subject: `Recordatorio: tu turno ${day} a las ${time}`,
    text:
      `Hola ${firstName(p.patientName)}:\n\n` +
      `Te recordamos tu turno ${day} a las ${time} con ${p.professionalName} (${p.orgName}).\n\n` +
      `Si no podés asistir, avisá con tiempo desde ${p.link}\n`,
  };
}

export function unreadMessage(p: { recipientName: string; fromName: string; orgName: string; link: string }): Rendered {
  return {
    subject: `Tenés un mensaje nuevo de ${p.fromName}`,
    text:
      `Hola ${firstName(p.recipientName)}:\n\n` +
      `${p.fromName} te escribió en ${p.orgName}. Por privacidad no incluimos el mensaje en este email: ` +
      `leelo en ${p.link}\n`,
  };
}

export function adherenceReminder(p: { patientName: string; orgName: string; link: string }): Rendered {
  return {
    subject: "¿Cómo te fue hoy con tu plan?",
    text:
      `Hola ${firstName(p.patientName)}:\n\n` +
      `Todavía no marcaste tus comidas de hoy. Es un toque por comida y le sirve mucho a tu profesional: ${p.link}\n\n` +
      `Podés desactivar este recordatorio desde tu portal (${p.orgName}).\n`,
  };
}

const monthName = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return DateTime.fromObject({ year: y, month: m }).setLocale("es-AR").toFormat("LLLL");
};

export function reportPublished(p: { patientName: string; month: string; orgName: string; link: string }): Rendered {
  return {
    subject: `Tu reporte de ${monthName(p.month)} está listo`,
    text:
      `Hola ${firstName(p.patientName)}:\n\n` +
      `Tu profesional de ${p.orgName} publicó el resumen de tu mes de ${monthName(p.month)}: ` +
      `cómo te fue con el plan, tu evolución y sus comentarios. Miralo en ${p.link}\n`,
  };
}

export function contactRequestReceived(p: { recipientName: string; orgName: string; link: string }): Rendered {
  return {
    subject: "Tenés una consulta nueva desde tu vidriera",
    text:
      `Hola ${firstName(p.recipientName)}:\n\n` +
      `Alguien te escribió desde la vidriera de ${p.orgName}. Por privacidad no incluimos el mensaje en este email: ` +
      `leelo y respondé en ${p.link}\n`,
  };
}

export function portalInvitation(p: { patientName: string; orgName: string; link: string; ttlDays: number }): Rendered {
  return {
    subject: `${p.orgName} te invita a tu portal de nutrición`,
    text:
      `Hola ${firstName(p.patientName)}:\n\n` +
      `${p.orgName} te sumó a su espacio en Nutreitor. Desde el portal vas a ver tu plan, tus mediciones ` +
      `y hablar con tu nutricionista.\n\n` +
      `Creá tu cuenta en ${p.link}\n\n` +
      `El link es personal y vence en ${p.ttlDays} días. Si no esperabas este mail, ignoralo.\n`,
  };
}

/**
 * Invitación con la anamnesis adentro (KAN-90): no tenía cuenta y tiene la primera
 * consulta por delante. El link crea la cuenta y lleva directo al formulario.
 */
export function portalInvitationWithIntake(p: {
  patientName: string;
  orgName: string;
  professionalName: string;
  link: string;
  ttlDays: number;
}): Rendered {
  return {
    subject: `Antes de tu primera consulta: completá tu ficha`,
    text:
      `Hola ${firstName(p.patientName)}:\n\n` +
      `${p.professionalName} (${p.orgName}) te pide que completes tu ficha antes de la primera consulta: ` +
      `tu salud, tu entrenamiento y tus hábitos. Te lleva unos minutos y la consulta rinde más.\n\n` +
      `Creá tu cuenta y completala en ${p.link}\n\n` +
      `Con la misma cuenta vas a ver tu plan y hablar con tu nutricionista. ` +
      `El link es personal y vence en ${p.ttlDays} días. Si no esperabas este mail, ignoralo.\n`,
  };
}

export function intakeRequested(p: { patientName: string; professionalName: string; orgName: string; form: string; link: string }): Rendered {
  return {
    subject: `${p.professionalName} te pidió completar un formulario`,
    text:
      `Hola ${firstName(p.patientName)}:\n\n` +
      `${p.professionalName} (${p.orgName}) te pidió completar ${p.form} antes de la consulta. ` +
      `Te lleva unos minutos: ${p.link}\n`,
  };
}
