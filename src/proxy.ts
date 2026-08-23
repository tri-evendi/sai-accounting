import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { isDocsPath } from "@/lib/docs";
import { isBearerApiPath } from "@/lib/api-v1";
import { resolvePostLoginPath } from "@/lib/post-login";
import {
  COMPANY_HOME_PATH,
  legacyCompanyHomePath,
  legacyTenantScopedPath,
  renamedPagePath,
  tenantPath,
} from "@/lib/tenant-routes";

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
  // Halaman pendaratan: pembacanya justru orang yang BELUM punya akun. Tanpa
  // baris ini proxy memantulkannya ke `/login` sebelum halamannya sempat
  // dirender — yaitu persis keadaan yang halaman itu dibuat untuk mengakhiri
  // (orang asing disambut formulir kata sandi). Pemantulan untuk yang SUDAH
  // bersesi tetap ada, tapi di halamannya sendiri: ia yang tahu tujuan
  // pasca-masuk, dan proxy tidak boleh menduanya.
  if (pathname === "/") return true;
  // issue #399 — halaman harga publik: alamat tujuan untuk kueri "harga
  // software akuntansi", berbagi root layout pemasaran dengan `/`. Jalur
  // PERSIS, bukan awalan; daftarnya dijaga `tests/authz-coverage` (grup
  // `(marketing)`).
  if (pathname === "/pricing") return true;
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
  /*
   * Berkas metadata halaman pendaratan. Ketiganya dibangkitkan Next dari
   * `app/robots.ts`, `app/sitemap.ts`, dan `app/(marketing)/opengraph-image.tsx`, dan
   * ketiganya HANYA berguna kalau bisa diambil TANPA sesi — pembacanya perayap
   * dan pratinjau tautan aplikasi perpesanan, yang tidak punya cookie.
   *
   * Tanpa baris ini semuanya dipantulkan ke `/login`: peta situs tak pernah
   * terbaca, dan setiap tautan yang ditempel ke WhatsApp memajang pratinjau
   * halaman MASUK — layar yang persis dihindari halaman pendaratan.
   *
   * `/opengraph-image` dicocokkan sebagai awalan, bukan persis: Next
   * menambahkan sufiks versi pada jalurnya (`/opengraph-image?<hash>` dan,
   * pada sebagian versi, segmen id) — jadi pencocokan persis akan lolos hari
   * ini lalu diam-diam berhenti cocok setelah pemutakhiran.
   */
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  if (pathname === "/opengraph-image" || pathname.startsWith("/opengraph-image/")) return true;
  /*
   * issue #300 — dokumentasi sistem. SATU-SATUNYA pelepasan berbentuk SUBPOHON
   * di berkas ini, dan itu memang perlu dibenarkan: baris-baris di atas sengaja
   * menyebut jalur PERSIS supaya halaman publik baru harus disebut namanya di
   * sini. Sebuah pohon dokumen tidak bisa dienumerasi di proxy — ia tumbuh
   * dengan setiap halaman yang ditulis, dan daftar yang harus diperbarui setiap
   * kali adalah daftar yang akan tertinggal.
   *
   * Yang menggantikan enumerasi itu adalah dua hal, dan keduanya lebih ketat
   * daripada sebuah daftar jalur:
   *   • bentuknya dijawab `isDocsPath` — satu fungsi murni yang diuji, bukan
   *     `startsWith("/docs")` telanjang yang juga akan melepaskan `/docsx`;
   *   • ISI subpohonnya dijaga `tests/authz-coverage.test.ts` (grup `(docs)`
   *     tidak boleh memuat penjaga apa pun) dan `tests/docs.test.ts`. Jadi
   *     "publik" di sini bukan janji melainkan sifat yang dibuktikan berkas
   *     demi berkas.
   *
   *     ⚠ Kalimat itu dulu berbunyi "tidak boleh mengimpor `auth()`, Prisma,
   *     atau chrome app internal", dan sejak `/docs` memakai DUA kulit
   *     (kepala publik tanpa sesi, kerangka aplikasi bagi yang sudah masuk) ia
   *     tidak lagi presisi: TEPAT SATU berkas layout membaca sesi, dan TEPAT
   *     SATU berkas kulit mengimpor `PlatformShell`. Keduanya berkas bernama
   *     yang didaftarkan sebagai pengecualian di `tests/docs.test.ts`, dijaga
   *     dua arah — jadi yang berubah bentuk jaminannya, bukan kekuatannya:
   *     halamannya sendiri tetap tidak boleh menyentuh sesi, dan pembaca
   *     ANONIM tetap tidak memicu satu pun query.
   */
  if (isDocsPath(pathname)) return true;
  // Unauthenticated health probe for container / Traefik load-balancer checks.
  if (pathname === "/api/health") return true;
  // issue #141 — webhook gerbang pembayaran: pengirimnya server Midtrans,
  // tanpa sesi. JALUR PERSIS, bukan prefix; kredensialnya tanda tangan
  // SHA-512 yang diverifikasi di route-nya (fail-closed tanpa kunci).
  if (pathname === "/api/billing/webhook") return true;
  if (pathname.startsWith("/api/auth/")) {
    return !pathname.startsWith("/api/auth/change-password");
  }
  /*
   * issue #389 — permukaan `/api/v1`: autentikasinya token Bearer, BUKAN
   * cookie sesi. Tanpa baris ini proxy menjawab 401 sebelum `requireApiToken`
   * sempat berjalan, sehingga tidak ada token sah yang bisa menjangkau satu
   * endpoint pun — dan itu memang yang terjadi di produksi sampai 2026-08-16.
   *
   * "Publik" di sini berarti publik BAGI PROXY, bukan tanpa penjaga: setiap
   * route di bawahnya memanggil `requireApiToken`, dan
   * `tests/api-v1-spec.test.ts` menuntutnya dengan izin yang sama persis
   * dengan yang didokumentasikan. Kecuali `openapi.json`, yang memang publik
   * dengan sengaja dan tidak memulangkan satu byte pun data perusahaan.
   *
   * Bentuknya dijawab fungsi murni yang diuji (`isBearerApiPath`), sepola
   * `isDocsPath` di atas — `startsWith("/api/v1")` telanjang juga akan
   * melepaskan `/api/v1x`.
   */
  if (isBearerApiPath(pathname)) return true;
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
    return teruskan(request);
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

  /*
   * /register ikut: orang yang sudah masuk tidak sedang mendaftar — form yang
   * dibiarkan terbuka hanya melahirkan pendaftaran yatim atas nama orang lain.
   *
   * Tujuannya diputuskan `resolvePostLoginPath` (issue #172), bukan ditulis
   * ulang di sini: ini pintu KETIGA menuju keadaan "sesi sudah sah, ke mana
   * sekarang?", dan salinan aturan di proxy adalah salinan yang paling mudah
   * ketinggalan — ia tak pernah terlihat dari tes halaman mana pun. Fungsinya
   * murni dan aman-edge (tanpa Prisma, tanpa `node:*`), jadi ia boleh dipanggil
   * dari sini.
   */
  if ((pathname === "/login" || pathname === "/register") && token) {
    const destination = resolvePostLoginPath(
      token.mustChangePassword === true,
      {
        companyId: typeof token.companyId === "number" ? token.companyId : null,
        tenantSlug: typeof token.tenantSlug === "string" ? token.tenantSlug : null,
        companySlug: typeof token.companySlug === "string" ? token.companySlug : null,
        /* Token lama belum membawanya — `undefined` di sini berarti "tidak
         * diketahui", dan pendaratannya mempertahankan perilaku lama. */
        tenantRole: typeof token.tenantRole === "string" ? token.tenantRole : undefined,
      },
      null
    );
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (isPublicPath(pathname)) {
    return teruskan(request);
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

  /*
   * ── Halaman yang BERGANTI NAMA: /tenant → /platform (issue #172) ──────────
   *
   * Mekanismenya sama dengan pantulan #157 di bawah — 307, bukan 308/301:
   * permanen tersimpan di cache peramban selamanya, dan alamat halaman masih
   * bisa berubah lagi. Petanya di `lib/tenant-routes.ts` (murni, aman-edge).
   *
   * Berdiri SESUDAH pemeriksaan sesi supaya pengunjung tanpa token tetap
   * bertemu /login lebih dulu, dan `renamedPagePath` menolak `/api/…` sendiri:
   * `/api/tenant/*` adalah permukaan API tingkat tenant (#135) yang namanya
   * memang benar dan TIDAK ikut pindah.
   */
  const renamed = renamedPagePath(pathname);
  if (renamed) {
    const target = request.nextUrl.clone();
    target.pathname = renamed;
    return NextResponse.redirect(target, 307);
  }

  /*
   * ── Beranda buku: `/t/{t}/{c}/dashboard` → `/t/{t}/{c}` ────────────────────
   *
   * Segmen `dashboard` dicabut karena akar sebuah perusahaan MEMANG berandanya
   * (alasan lengkapnya di `COMPANY_HOME_PATH`, `lib/tenant-routes.ts`). Yang
   * dipantulkan di sini adalah alamat yang sudah terlanjur beredar: bookmark,
   * tautan di surel yang sudah terkirim, dan riwayat peramban.
   *
   * 307, sama alasannya dengan pantulan di bawah: 308/301 tersimpan di cache
   * peramban selamanya, dan alamat yang sudah di-cache tidak bisa ditarik
   * kembali kalau kelak keputusannya berubah.
   *
   * ⚠ Pertanyaan "apakah ini alamat lama?" dijawab `legacyCompanyHomePath`,
   * BUKAN `parseTenantPath().rest` — yang terakhir menormalkan akar perusahaan
   * menjadi `/dashboard` dan karenanya tidak bisa membedakan keduanya. Versi
   * pertama pantulan ini memakainya, dan berputar tanpa henti pada PT yang
   * slug-nya bernama `dashboard` (issue #343); alasan lengkapnya di sana.
   */
  if (!pathname.startsWith("/api/")) {
    const lama = legacyCompanyHomePath(pathname);
    if (lama) {
      const target = request.nextUrl.clone();
      target.pathname = tenantPath(lama.tenantSlug, lama.companySlug, COMPANY_HOME_PATH);
      return NextResponse.redirect(target, 307);
    }
  }

  /*
   * ── Jalur LAMA → jalur kanonik `/t/{tenant}/{company}/…` (issue #157) ──────
   *
   * 307 (bukan 308/301): permanen akan tersimpan di cache peramban selamanya,
   * dan perusahaan tujuan di sini bergantung pada SESI — orang yang sama, PT
   * terakhir yang berbeda, jawaban yang berbeda. Pantulan yang di-cache akan
   * membawa pengguna ke buku PT lain berbulan-bulan setelah kejadiannya.
   * 307 juga mempertahankan metode & bodi, jadi POST tidak berubah menjadi GET.
   *
   * Hanya jalur yang segmen akarnya SUDAH dimigrasikan yang dipantulkan
   * (`legacyTenantScopedPath`); sisanya tetap dilayani halaman lama. Tanpa
   * slug di token — sesi lama, atau pengguna yang belum memilih PT — TIDAK ada
   * pantulan: penjaga halaman yang mengarahkannya ke /select-company atau
   * /companies/new, satu-satunya tempat aturan itu ditulis.
   *
   * Ini murni pantulan kenyamanan. Otorisasinya tetap di `requirePagePermission`
   * di jalur tujuan — proxy tidak pernah membuktikan keanggotaan.
   */
  if (
    request.method === "GET" &&
    !pathname.startsWith("/api/") &&
    legacyTenantScopedPath(pathname)
  ) {
    const tenantSlug = typeof token.tenantSlug === "string" ? token.tenantSlug : null;
    const companySlug = typeof token.companySlug === "string" ? token.companySlug : null;
    if (tenantSlug && companySlug) {
      const target = request.nextUrl.clone();
      target.pathname = tenantPath(tenantSlug, companySlug, pathname);
      return NextResponse.redirect(target, 307);
    }
  }

  return teruskan(request);
}

/**
 * Teruskan permintaan, dengan JALURNYA dititipkan sebagai header.
 *
 * ══ KENAPA HEADER, DAN KENAPA DI SINI ══════════════════════════════════════
 * Server component tidak bisa membaca alamat yang sedang dibuka — ia hanya
 * menerima `params`. Untuk hampir semua hal itu cukup; untuk SATU hal tidak:
 * ketika slug akun berganti (#458), penjaga halaman harus memantulkan ke
 * alamat yang SAMA di bawah slug baru — dan tanpa jalur dalamnya, satu-satunya
 * pantulan yang bisa ia berikan adalah "kembali ke beranda", yang mengubah
 * sebuah bookmark ke faktur tertentu menjadi kunjungan ke dasbor.
 *
 * Proxy tahu alamatnya tanpa satu query pun, jadi ia yang menitipkannya.
 *
 * ⚠ Header ini DITULIS ULANG di setiap permintaan, tidak pernah dipercaya dari
 * luar: tanpa itu, penyerang bisa mengirim `x-sai-path` pilihannya sendiri dan
 * mengubah tujuan pantulan menjadi alamat mana pun. Nilai kiriman klien
 * ditimpa, bukan diperiksa.
 */
function teruskan(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-sai-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|icons).*)"],
};
