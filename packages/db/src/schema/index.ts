export * from "./_region.js";
export * from "./organizations.js";
export * from "./locations.js";
export * from "./patients.js";
export * from "./users.js";
export * from "./memberships.js";
export * from "./refresh-tokens.js";
export * from "./invitations.js";
export * from "./care-assignments.js";
export * from "./patient-notes.js";
export * from "./patient-metrics.js";
export * from "./meal-plans.js";
export * from "./audit-log.js";
export * from "./professional-profiles.js";
export * from "./scheduling.js";
export * from "./agents.js";
export * from "./org-modules.js";

import { organizations } from "./organizations.js";
import { locations } from "./locations.js";
import { patients } from "./patients.js";
import { users } from "./users.js";
import { memberships } from "./memberships.js";
import { refreshTokens } from "./refresh-tokens.js";
import { invitations } from "./invitations.js";
import { careAssignments } from "./care-assignments.js";
import { patientNotes } from "./patient-notes.js";
import { patientMetrics } from "./patient-metrics.js";
import { mealPlans } from "./meal-plans.js";
import { auditLog } from "./audit-log.js";
import { professionalProfiles } from "./professional-profiles.js";
import { availabilityRules, appointments } from "./scheduling.js";
import { agentConversations, agentMessages, agentRuns, agentConsents } from "./agents.js";
import { orgModules } from "./org-modules.js";

/** Schema completo para pasar a drizzle() y a drizzle-kit. */
export const schema = {
  organizations,
  locations,
  patients,
  users,
  memberships,
  refreshTokens,
  invitations,
  careAssignments,
  patientNotes,
  patientMetrics,
  mealPlans,
  auditLog,
  professionalProfiles,
  availabilityRules,
  appointments,
  agentConversations,
  agentMessages,
  agentRuns,
  agentConsents,
  orgModules,
};
