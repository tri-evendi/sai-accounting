import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  clientIpFrom,
  configuredOperatorHost,
  decideOperatorRouting,
  ipAllowed,
  normalizeHost,
  operatorCookieName,
} from "@/lib/operator/plane";

/** NextAuth routes only — not change-password API. */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  // issue #136 — alur atur-ulang kata sandi mandiri: orang yang lupa kata
  // sandinya jelas belum punya sesi. API pasangannya sudah tercakup
  // `/api/auth/*` di bawah.
  if (pathname === "/forgot-password" || pathname === "/reset-password") return true;
  // issue #139 — penerimaan undangan staf: penerimanya BELUM punya akun, jadi
  // jelas belum punya sesi. Kredensialnya token sekali-pakai dari surel; API
  // pasangannya sudah tercakup `/api/auth/*` di bawah.
  if (pathname === "/accept-invitation") return true;
  // issue #138 — pendaftaran mandiri + verifikasi email: keduanya PRA-akun.
  // HANYA dua jalur ini yang dilepas — bukan prefix, supaya halaman publik
  // baru harus disebut namanya di sini (dan di tests/authz-coverage).
  if (pathname === "/register" || pathname === "/verify-email") return true;
  // issue #142 — dokumen hukum: harus terbaca SEBELUM orang menyetujuinya.
  if (pathname === "/terms" || pathname === "/privacy") return true;
  // Unauthenticated health probe for container / Traefik load-balancer checks.
  if (pathname === "/api/health") return true;
  // issue #141 — webhook gerbang pembayaran: pengirimnya server Midtrans,
  // tanpa sesi. JALUR PERSIS, bukan prefix; kredensialnya tanda tangan
  // SHA-512 yang diverifikasi di route-nya (fail-closed tanpa kunci).
  if (pathname === "/api/billing/webhook") return true;
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

  /*
   * ── Bidang OPERATOR (issue #154) — tembok terluar pemisahan bidang ────────
   *
   * Konsol operator hidup di hostname sendiri (`OPERATOR_HOST`), di luar
   * lingkup cookie aplikasi pelanggan. Logika keputusannya MURNI di
   * `lib/operator/plane.ts` (aman-edge — tanpa Prisma, tanpa platform-db;
   * doktrin #137 tetap berlaku di proxy) dan GAGAL-TERTUTUP:
   *
   *   • `OPERATOR_HOST` tidak diset → /operator = 404 di semua host.
   *   • Host pelanggan → /operator = 404; host operator → rute pelanggan
   *     (login, dasbor, API) = 404. Sesi pelanggan tidak pernah sampai ke
   *     konsol, sesi operator tidak pernah sampai ke aplikasi pelanggan.
   *   • `OPERATOR_IP_ALLOWLIST` kosong → semua IP ditolak (`/api/health`
   *     dikecualikan — probe load-balancer bukan permukaan konsol).
   *
   * Proxy di sini hanya tembok + redirect login (memeriksa ADA-nya cookie);
   * verifikasi kriptografis sesi operator terjadi di `requireOperatorPage()`
   * pada setiap halaman — pola yang sama dengan penjaga izin pelanggan
   * (issue #73: proxy = jaring pengaman, keputusan akhirnya di penjaga).
   */
  const operatorHost = configuredOperatorHost();
  const operatorDecision = decideOperatorRouting(
    request.headers.get("host"),
    pathname,
    operatorHost
  );
  if (operatorDecision.kind === "blocked") {
    // Akar host operator dipulangkan ke konsolnya; sisanya 404 polos.
    if (pathname === "/" && normalizeHost(request.headers.get("host")) === operatorHost) {
      return NextResponse.redirect(new URL("/operator", request.url));
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 404 });
  }
  if (operatorDecision.kind === "operator" || operatorDecision.kind === "operator-public") {
    if (
      pathname !== "/api/health" &&
      !ipAllowed(clientIpFrom(request.headers), process.env.OPERATOR_IP_ALLOWLIST)
    ) {
      return new NextResponse(null, { status: 404 });
    }
    if (operatorDecision.kind === "operator") {
      const hasOperatorCookie =
        request.cookies.has(operatorCookieName(true)) ||
        request.cookies.has(operatorCookieName(false));
      if (!hasOperatorCookie) {
        return NextResponse.redirect(new URL("/operator/login", request.url));
      }
    }
    // Bidang operator TIDAK menjalani alur sesi pelanggan di bawah.
    return NextResponse.next();
  }

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

  // /register ikut: orang yang sudah masuk tidak sedang mendaftar — form yang
  // dibiarkan terbuka hanya melahirkan pendaftaran yatim atas nama orang lain.
  if ((pathname === "/login" || pathname === "/register") && token) {
    const destination =
      token.mustChangePassword ? "/change-password" : "/dashboard";
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

  const mustChangePassword = token.mustChangePassword === true;
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
