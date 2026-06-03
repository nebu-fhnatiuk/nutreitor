export * from "./_region.js";
export * from "./organizations.js";
export * from "./patients.js";
export * from "./users.js";
export * from "./memberships.js";
export * from "./refresh-tokens.js";
export * from "./invitations.js";
export * from "./patient-assignments.js";
export * from "./audit-log.js";

import { organizations } from "./organizations.js";
import { patients } from "./patients.js";
import { users } from "./users.js";
import { memberships } from "./memberships.js";
import { refreshTokens } from "./refresh-tokens.js";
import { invitations } from "./invitations.js";
import { patientAssignments } from "./patient-assignments.js";
import { auditLog } from "./audit-log.js";

/** Schema completo para pasar a drizzle() y a drizzle-kit. */
export const schema = {
  organizations,
  patients,
  users,
  memberships,
  refreshTokens,
  invitations,
  patientAssignments,
  auditLog,
};
