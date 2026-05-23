import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** NextAuth routes only — not change-password API. */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) {
    return !pathname.startsWith("/api/auth/change-password");
  }
  return false;
}

/** Routes limited to specific roles (prefix match). */
const ROLE_ROUTES: { prefix: string; roles: string[] }[] = [
  { prefix: "/finance", roles: ["bos", "core"] },
  { prefix: "/contracts", roles: ["bos", "core"] },
  { prefix: "/invoices", roles: ["bos", "core"] },
  { prefix: "/suppliers", roles: ["bos", "core"] },
  { prefix: "/customers", roles: ["bos", "core"] },
  { prefix: "/documents", roles: ["bos", "core"] },
  { prefix: "/users", roles: ["bos"] },
  { prefix: "/api/audit", roles: ["bos"] },
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

  if (pathname === "/login" && token) {
    const destination =
      token.status === 1 ? "/change-password" : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const mustChangePassword = token.status === 1;
  const allowedWhilePasswordReset =
    pathname === "/change-password" || pathname === "/api/auth/change-password";

  if (mustChangePassword && !allowedWhilePasswordReset) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Password change required" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  const role = token.role as string | undefined;
  for (const rule of ROLE_ROUTES) {
    if (pathname.startsWith(rule.prefix) || pathname.startsWith(`/api${rule.prefix}`)) {
      if (!role || !rule.roles.includes(role)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|icons).*)"],
};
