import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

/*
 * ── issue #73: gerbang per-prefix DIHAPUS, proxy = autentikasi saja ────────
 *
 * Sampai fase 2 file ini memuat gerbang peran per-prefix yang diturunkan
 * dari matriks statis di kode. Sejak matriks bisa di-OVERRIDE dari DB
 * (halaman /permissions), gerbang statis itu justru berbahaya: override yang
 * MENGHADIAHKAN izin (mis. core diberi `report.read`) akan tetap diblokir di
 * sini karena proxy hanya melihat matriks bawaan di kode.
 *
 * Membaca matriks efektif dari proxy bukan pilihan yang bersih: dokumen Next
 * (node_modules/next/dist/docs/.../proxy.md) menegaskan proxy dieksekusi
 * terpisah dari kode render dan "should not attempt relying on shared
 * modules or globals" — cache matriks + invalidasinya di
 * `lib/authz-effective.ts` tidak pernah terlihat dari sini, dan menyeret
 * Prisma ke proxy menambah satu query DB untuk SETIAP request.
 *
 * Maka proxy kembali ke tugas jaring pengaman murninya: verifikasi JWT +
 * alur wajib-ganti-kata-sandi. Route dashboard menjadi authenticated-only di
 * lapisan ini; penegakan IZIN sepenuhnya di `requirePagePermission` /
 * `requireApiPermission` yang membaca matriks efektif — dan
 * `tests/authz-coverage.test.ts` membuktikan setiap halaman dashboard dan
 * API route memanggil penjaganya, jadi tidak ada permukaan yang kehilangan
 * pagar karena perubahan ini. (Lihat docs/RBAC.md § Proxy.)
 */

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|icons).*)"],
};
