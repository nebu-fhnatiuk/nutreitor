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
