import { SetMetadata } from "@nestjs/common";
import type { MembershipRole } from "@nutreitor/shared";

export const ROLES_KEY = "roles";

/** Restringe un handler/controller a ciertos roles dentro del tenant. */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
