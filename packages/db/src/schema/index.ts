export * from "./organizations.js";
export * from "./patients.js";
export * from "./users.js";
export * from "./memberships.js";
export * from "./refresh-tokens.js";

import { organizations } from "./organizations.js";
import { patients } from "./patients.js";
import { users } from "./users.js";
import { memberships } from "./memberships.js";
import { refreshTokens } from "./refresh-tokens.js";

/** Schema completo para pasar a drizzle() y a drizzle-kit. */
export const schema = {
  organizations,
  patients,
  users,
  memberships,
  refreshTokens,
};
