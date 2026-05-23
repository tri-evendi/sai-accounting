import { auth } from "@/lib/auth";
import type { Role } from "@/lib/constants";
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
