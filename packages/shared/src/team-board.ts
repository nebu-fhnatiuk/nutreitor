/**
 * Fila del tablero del cuerpo técnico (KAN-109). Función pura y ÚNICO punto de
 * decisión del recorte por consentimiento: sin él, ni Σ6 ni masa muscular, y el
 * semáforo se calcula sin la variación de Σ6 para que no se filtre por el texto.
 */
import type { TeamBoardRowDto, TeamCheckinDto } from "./dtos/team.dto.js";
import { boardStatus } from "./squad-board.js";

export interface TeamRowInput {
  patientId: string;
  fullName: string;
  /** ¿Consintió compartir su composición corporal con el cuerpo técnico? */
  consent: boolean;
  lastMeasuredOn: string | null;
  sum6: number | null;
  sum6Delta: number | null;
  muscleKg: number | null;
  muscleKgDelta: number | null;
  bodyMass: number | null;
  bodyMassDelta: number | null;
  lossPct: number | null;
  adherence7: number | null;
  adherencePrev7: number | null;
  checkin: TeamCheckinDto | null;
  hasPlan: boolean;
  nextAppointmentAt: string | null;
}

export function teamBoardRow(i: TeamRowInput, today: string): TeamBoardRowDto {
  const status = boardStatus(
    {
      lastMeasuredOn: i.lastMeasuredOn,
      sum6Delta: i.consent ? i.sum6Delta : null,
      lossPct: i.lossPct,
      adherence7: i.adherence7,
      adherencePrev7: i.adherencePrev7,
    },
    today,
  );
  return {
    patientId: i.patientId,
    fullName: i.fullName,
    status,
    adherence7: i.adherence7,
    adherencePrev7: i.adherencePrev7,
    checkin: i.checkin,
    bodyMass: i.bodyMass,
    bodyMassDelta: i.bodyMassDelta,
    lossPct: i.lossPct,
    hasPlan: i.hasPlan,
    nextAppointmentAt: i.nextAppointmentAt,
    body: i.consent ? { sum6: i.sum6, sum6Delta: i.sum6Delta, muscleKg: i.muscleKg, muscleKgDelta: i.muscleKgDelta } : null,
  };
}
