import { z } from "zod";

/**
 * Agendamiento. Invariante de husos: los instantes (starts_at/ends_at) viajan en
 * UTC (ISO con offset/Z); el huso de presentación lo resuelve el cliente. La
 * disponibilidad se define en el huso IANA del profesional.
 */

export type AppointmentStatus = "booked" | "cancelled" | "completed" | "no_show";
export type AppointmentBookedVia = "professional" | "patient" | "public";

// ── Disponibilidad ───────────────────────────────────────────────────────────

/** Ventana de disponibilidad en el huso del profesional (minutos desde medianoche). */
const availabilityWindowSchema = z
  .object({
    weekday: z.number().int().min(1).max(7), // ISO: 1=lunes … 7=domingo
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
    slotMinutes: z.number().int().min(5).max(480),
  })
  .refine((w) => w.startMinute < w.endMinute, {
    message: "El fin debe ser posterior al inicio.",
  });
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>;

/** Reemplaza la disponibilidad del profesional (un huso + N ventanas). */
export const setAvailabilitySchema = z.object({
  timezone: z.string().min(1).max(60),
  windows: z.array(availabilityWindowSchema).max(50),
});
export type SetAvailabilityDto = z.infer<typeof setAvailabilitySchema>;

export interface AvailabilityDto {
  timezone: string | null;
  windows: AvailabilityWindow[];
}

// ── Slots (resultado del cálculo) ──────────────────────────────────────────────

/** Slot libre: instantes UTC. El cliente lo muestra en el huso del que mira. */
export interface SlotDto {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
}

// ── Reserva ────────────────────────────────────────────────────────────────────

const isoDatetime = z.string().datetime({ offset: true });

/** Reserva interna: el slot elegido (startsAt UTC). El server valida que sea un
 * slot válido y libre, y deriva el fin. `patientId` sólo lo manda el profesional/
 * admin (reserva en nombre de); el portal lo resuelve por sesión. */
export const bookAppointmentSchema = z.object({
  startsAt: isoDatetime,
  patientId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});
export type BookAppointmentDto = z.infer<typeof bookAppointmentSchema>;

/** Reserva pública (lead → cita): visitante sin sesión. Crea/relaciona paciente. */
export const publicBookAppointmentSchema = z.object({
  startsAt: isoDatetime,
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
});
export type PublicBookAppointmentDto = z.infer<typeof publicBookAppointmentSchema>;

/** Confirmación de una reserva pública (sin datos internos del paciente). */
export interface PublicBookingResult {
  startsAt: string;
  endsAt: string;
  professionalName: string;
}

/** Reprogramar: nuevo slot. */
export const rescheduleAppointmentSchema = z.object({
  startsAt: isoDatetime,
});
export type RescheduleAppointmentDto = z.infer<typeof rescheduleAppointmentSchema>;

// ── Lectura ────────────────────────────────────────────────────────────────────

export interface AppointmentDto {
  id: string;
  patientId: string;
  patientName: string;
  professionalName: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  durationMinutes: number;
  status: AppointmentStatus;
  bookedVia: AppointmentBookedVia;
  notes: string | null;
  createdAt: string;
}
