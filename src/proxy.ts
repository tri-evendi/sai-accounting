import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { rolesFor, type Permission } from "@/lib/authz";

/** NextAuth routes only — not change-password API. */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  // Unauthenticated health probe for container / Traefik load-balancer checks.
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/auth/")) {
    return !pathname.startsWith("/api/auth/change-password");
  }
  return false;
}

/**
 * Lapisan CADANGAN per-prefix (audit RBAC fase 2): perannya tidak lagi
 * diketik di sini, melainkan diturunkan dari matriks `lib/authz.ts` lewat
 * izin TERLONGGAR di bawah prefix itu (mis. `/accounts` memakai
 * `account.read` karena core boleh membaca daftar akun via API, walau
 * halamannya bos-only — penjaga halaman/route yang mengetatkan).
 * Penegakan sesungguhnya tetap `requirePagePermission` /
 * `requireApiPermission` di tiap halaman/route.
 */
const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/finance", permission: "cash.read" },
  { prefix: "/contracts", permission: "contract.read" },
  { prefix: "/invoices", permission: "invoice.read" },
  { prefix: "/suppliers", permission: "supplier.read" },
  { prefix: "/customers", permission: "customer.read" },
  { prefix: "/documents", permission: "document.read" },
  { prefix: "/users", permission: "user.manage" },
  { prefix: "/api/audit", permission: "audit.read" },
  { prefix: "/reports", permission: "report.read" },
  { prefix: "/budget", permission: "budget.manage" },
  { prefix: "/journal", permission: "journal.read" },
  { prefix: "/ledger", permission: "ledger.read" },
  { prefix: "/accounts", permission: "account.read" },
  { prefix: "/periods", permission: "period.manage" },
  { prefix: "/setup", permission: "setup.manage" },
  { prefix: "/tax", permission: "tax.read" },
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth.js names the session cookie `__Secure-authjs.session-token` (and salts
  // the JWT with that name) whenever the effective auth URL is HTTPS. getToken
  // defaults secureCookie to false, so behind a TLS-terminating proxy (Traefik)
  // it would read the wrong cookie/salt and never see the session — causing an
  // endless /login ↔ /dashboard redirect loop. Mirror Auth.js's own signal.
  const useSecureCookies =
    process.env.AUTH_URL?.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: useSecureCookies,
  });

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
  for (const rule of ROUTE_PERMISSIONS) {
    if (pathname.startsWith(rule.prefix) || pathname.startsWith(`/api${rule.prefix}`)) {
      const roles = rolesFor(rule.permission) as readonly string[];
      if (!role || !roles.includes(role)) {
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
