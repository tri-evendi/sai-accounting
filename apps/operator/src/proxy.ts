import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  clientIpFrom,
  configuredOperatorHost,
  decideOperatorRouting,
  ipAllowed,
  operatorCookieName,
} from "@sai/core/operator-plane";
import { decideConsoleGate, enrolmentCookieName } from "@op/lib/operator/enrolment-gate";

/**
 * Tembok terluar KONSOL OPERATOR sebagai aplikasi tersendiri (monorepo Fase 3d).
 *
 * Keputusannya tetap `decideOperatorRouting` — fungsi MURNI yang sama yang
 * dipakai `src/proxy.ts` pelanggan — sehingga kedua aplikasi tidak bisa
 * berbeda pendapat tentang host mana milik siapa. Di sini aplikasi tidak
 * punya bidang pelanggan sama sekali, jadi setiap putusan selain bidang
 * operator berarti 404:
 *
 *   • `OPERATOR_HOST` tidak diset → seluruh konsol 404 (gagal-tertutup).
 *   • Host lain (Traefik salah arah) → 404, BUKAN rute pelanggan.
 *   • `OPERATOR_IP_ALLOWLIST` kosong → semua IP ditolak; `/api/health`
 *     dikecualikan untuk probe load-balancer.
 *   • Tanpa cookie sesi → `/login`. Hanya cookie PEMASANGAN → halaman
 *     pemasangan saja (`decideConsoleGate`). Verifikasi kriptografisnya tetap
 *     di `requireOperatorPage()` / `requireOperatorActionSession()`.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const operatorHost = configuredOperatorHost();

  // Probe load-balancer: hidup di host mana pun yang dipakai Docker/Traefik.
  if (pathname === "/api/health") return NextResponse.next();

  const decision = decideOperatorRouting(host, pathname, operatorHost);
  if (decision.kind === "customer") {
    // Host lain, atau OPERATOR_HOST tidak diset: aplikasi ini tidak punya
    // satu pun rute untuk bidang itu.
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(null, { status: 404 });
  }

  if (!ipAllowed(clientIpFrom(request.headers), process.env.OPERATOR_IP_ALLOWLIST)) {
    return new NextResponse(null, { status: 404 });
  }

  if (decision.kind === "operator") {
    const gate = decideConsoleGate(pathname, {
      session: request.cookies.has(operatorCookieName(true)) || request.cookies.has(operatorCookieName(false)),
      enrolment:
        request.cookies.has(enrolmentCookieName(true)) || request.cookies.has(enrolmentCookieName(false)),
    });
    if (gate.kind === "redirect") return NextResponse.redirect(new URL(gate.to, request.url));
  }

  const headers = new Headers(request.headers);
  headers.set("x-sai-path", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|icons).*)"],
};
