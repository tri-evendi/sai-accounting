import { auth } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { redirect } from "next/navigation";

/**
 * Server-side guard for dashboard pages.
 * Redirects unauthenticated users to login and unauthorized roles to dashboard.
 */
export async function requirePageSession(allowedRoles?: Role[]) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role as Role;

  if (allowedRoles && !allowedRoles.includes(role)) {
    redirect("/dashboard");
  }

  return session;
}

/**
 * Guard for accounting-only pages (Jurnal, Buku Besar, COA) — issue #11.
 *
 * Layered ON TOP of the role check, not instead of it: the page is first gated
 * to `allowedRoles` (default `["bos"]`, so core/ptg are already turned away by
 * role and can never reach this), then additionally refused unless the user's
 * EFFECTIVE Mode Akuntan is ON. This is why hiding the sidebar item is not the
 * whole feature — the same `effectiveAccountantMode` decision that hides the menu
 * also refuses to render the page, so a bos who turned Mode Akuntan OFF is
 * redirected rather than served the page by typing its URL.
 */
export async function requireAccountantPage(allowedRoles: Role[] = ["bos"]) {
  const session = await requirePageSession(allowedRoles);

  if (!effectiveAccountantMode(session.user)) {
    redirect("/dashboard");
  }

  return session;
}
