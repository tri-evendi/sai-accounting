import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/constants";

type AuthResult =
  | { authorized: true; session: { user: { id: string; role: string; name: string; email: string; status: number } } }
  | { authorized: false; response: NextResponse };

/**
 * Check authentication and optionally role-based authorization.
 * Usage:
 *   const result = await requireAuth();                    // any authenticated user
 *   const result = await requireAuth(["bos"]);             // only bos role
 *   const result = await requireAuth(["bos", "core"]);     // bos or core
 */
export async function requireAuth(allowedRoles?: Role[]): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role as Role)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { authorized: true, session: session as AuthResult extends { authorized: true } ? AuthResult["session"] : never } as AuthResult;
}
