import { ROLES, type Role } from "@/lib/constants";

/**
 * "Mode Akuntan" (issue #11) — display-only preference deciding whether a user
 * sees the accounting surfaces (Jurnal, Buku Besar, COA) and the debit/kredit
 * terminology on transaction forms.
 *
 * This module is PURE (no Prisma, no auth, no I/O) so the same decision drives
 * the client sidebar/navbar AND the server-side page guards — a single source of
 * truth, which is what keeps the feature more than cosmetic.
 *
 * It is display-only: it NEVER grants access (role still gates every accounting
 * page) and NEVER changes what the posting engine writes.
 */

/**
 * The default mode for a role when the user has no explicit preference:
 * bos (Manager/akuntan) → ON; core (Staff) and ptg → OFF.
 */
export function roleDefaultAccountantMode(role: string | null | undefined): boolean {
  return role === ROLES.BOS;
}

/** The minimal shape the decision needs — a role plus the stored preference. */
export interface AccountantModeUser {
  role: string | null | undefined;
  /** NULL/undefined = follow the role default; true/false = explicit override. */
  accountantMode?: boolean | null;
}

/**
 * The EFFECTIVE accountant mode for a user: an explicit true/false preference
 * wins; otherwise fall back to the role default. Never throws — an unknown role
 * simply resolves to OFF.
 */
export function effectiveAccountantMode(user: AccountantModeUser): boolean {
  if (user.accountantMode === true || user.accountantMode === false) {
    return user.accountantMode;
  }
  return roleDefaultAccountantMode(user.role);
}

/** Roles allowed to hold accountant mode at all (defence-in-depth labelling). */
export const ACCOUNTANT_ROLES: Role[] = [ROLES.BOS];
