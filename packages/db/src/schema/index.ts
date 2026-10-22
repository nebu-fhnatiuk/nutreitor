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
export * from "./foods.js";
export * from "./recipes.js";
export * from "./plan-templates.js";
export * from "./adherence.js";
export * from "./conversations.js";
export * from "./patient-reports.js";
export * from "./org-signups.js";
export * from "./contact-requests.js";
export * from "./password-resets.js";
export * from "./anthropometry.js";
export * from "./patient-groups.js";
export * from "./energy-requirements.js";
export * from "./dietary-recalls.js";
export * from "./food-frequency.js";
export * from "./sweat-tests.js";
export * from "./notifications.js";

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
import { foodCatalog, tenantFoods } from "./foods.js";
import { recipeLibrary, tenantRecipes } from "./recipes.js";
import { planTemplates } from "./plan-templates.js";
import { adherenceCheckins, adherenceMealLogs } from "./adherence.js";
import { conversationReads, conversations, messages } from "./conversations.js";
import { patientReports } from "./patient-reports.js";
import { orgSignups } from "./org-signups.js";
import { contactRequests } from "./contact-requests.js";
import { passwordResets } from "./password-resets.js";
import { anthropometrySessions } from "./anthropometry.js";
import { patientGroups, patientGroupMembers } from "./patient-groups.js";
import { energyRequirements } from "./energy-requirements.js";
import { dietaryRecalls } from "./dietary-recalls.js";
import { foodFrequencySurveys } from "./food-frequency.js";
import { sweatTests } from "./sweat-tests.js";
import { notificationPreferences } from "./notifications.js";

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
  foodCatalog,
  tenantFoods,
  recipeLibrary,
  tenantRecipes,
  planTemplates,
  adherenceMealLogs,
  adherenceCheckins,
  conversations,
  messages,
  conversationReads,
  patientReports,
  orgSignups,
  contactRequests,
  passwordResets,
  anthropometrySessions,
  patientGroups,
  patientGroupMembers,
  energyRequirements,
  dietaryRecalls,
  foodFrequencySurveys,
  sweatTests,
  notificationPreferences,
};
