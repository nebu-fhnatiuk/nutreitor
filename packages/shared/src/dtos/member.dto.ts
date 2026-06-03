import { z } from "zod";

import { membershipRoles, type MembershipRole } from "./auth.dto.js";

/** Miembro de la organización (listado admin). */
export interface MemberDto {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  role: MembershipRole;
  status: "active" | "revoked";
  createdAt: string;
}

export const changeRoleSchema = z.object({
  role: z.enum(membershipRoles),
});

export type ChangeRoleDto = z.infer<typeof changeRoleSchema>;
