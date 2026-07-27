import { FULL_ACCESS_ROLES, isFullAccessRole, type Role } from "@/lib/constants";

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
 * the FULL-ACCESS roles (managing_director, administrator) → ON;
 * finance_manager and warehouse_head → OFF.
 *
 * `administrator` is included deliberately. Mode Akuntan is the second gate in
 * front of every accounting page (`requirePagePermission` demands it on top of
 * the permission check), so a role that holds every permission but defaults to
 * mode OFF would be bounced off Jurnal / Buku Besar / COA — "full access" would
 * be a lie on exactly the surfaces an administrator is most likely to need.
 * It stays a DISPLAY preference: an administrator who does not want the
 * accounting vocabulary can still switch it off from the navbar.
 */
export function roleDefaultAccountantMode(role: string | null | undefined): boolean {
  return isFullAccessRole(role);
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
export const ACCOUNTANT_ROLES: Role[] = [...FULL_ACCESS_ROLES];
