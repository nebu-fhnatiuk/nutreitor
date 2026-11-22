import { z } from "zod";

import type { BoardStatus } from "../squad-board.js";

/**
 * Cuerpo técnico (KAN-109, ADR 0054). El tablero es una versión recortada de la
 * pizarra del plantel: sin ficha, sin plan, y la composición corporal sólo de quien
 * dio su consentimiento.
 */

/** Consentimiento para compartir Σ6 y masa muscular con el cuerpo técnico. */
export const staffSharingSchema = z.object({ shareBody: z.boolean() }).strict();
export type StaffSharingDto = z.infer<typeof staffSharingSchema>;

/** Quién registró el consentimiento: el deportista en el portal o el admin (papel firmado). */
export type StaffSharingSource = "athlete" | "admin";

export const addGroupCoachSchema = z.object({ membershipId: z.string().uuid() }).strict();
export type AddGroupCoachDto = z.infer<typeof addGroupCoachSchema>;

export interface GroupCoachDto {
  membershipId: string;
  fullName: string;
  email: string;
}

export interface TeamGroupDto {
  id: string;
  name: string;
  members: number;
}

export interface TeamCheckinDto {
  date: string;
  energy: number | null;
  mood: number | null;
}

export interface TeamBodyDto {
  sum6: number | null;
  sum6Delta: number | null;
  muscleKg: number | null;
  muscleKgDelta: number | null;
}

export interface TeamBoardRowDto {
  patientId: string;
  fullName: string;
  status: BoardStatus;
  adherence7: number | null;
  adherencePrev7: number | null;
  checkin: TeamCheckinDto | null;
  bodyMass: number | null;
  bodyMassDelta: number | null;
  lossPct: number | null;
  hasPlan: boolean;
  /** Próximo turno con la nutricionista (ISO), sólo la fecha y hora. */
  nextAppointmentAt: string | null;
  /** null = el deportista no dio su consentimiento. */
  body: TeamBodyDto | null;
}

export interface TeamBoardDto {
  today: string;
  group: { id: string; name: string };
  rows: TeamBoardRowDto[];
  coverage: { members: number; logging30: number; withPlan: number; measured30: number };
}
