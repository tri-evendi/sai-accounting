/**
 * BIDANG OPERATOR (issue #154) — logika MURNI pemisahan bidang autentikasi
 * konsol operator dari aplikasi pelanggan.
 *
 * Konsol operator hidup di HOSTNAME SENDIRI (`OPERATOR_HOST`) di luar lingkup
 * cookie aplikasi pelanggan: sesi pelanggan yang bocor tidak pernah sampai ke
 * konsol, dan sebaliknya. Grup rute `(operator)` dipilih alih-alih aplikasi
 * kedua (keputusan #154) — dan justru karena itu PEMERIKSAAN HOST-lah yang
 * menegakkan pemisahan bidangnya, sehingga ia WAJIB GAGAL-TERTUTUP:
 *
 *   • `OPERATOR_HOST` tidak diset → seluruh rute /operator TIDAK TERJANGKAU
 *     di host mana pun — bukan terbuka-diam-diam.
 *   • Di host pelanggan, /operator = 404. Di host operator, rute pelanggan
 *     (dasbor, login pelanggan, API) = 404.
 *   • Daftar IP (`OPERATOR_IP_ALLOWLIST`) kosong/tidak diset → SEMUA ditolak;
 *     membukanya harus eksplisit (`*` hanya untuk pengembangan lokal).
 *
 * Modul ini MURNI dan AMAN-EDGE dengan sengaja: tanpa Prisma, tanpa
 * `node:crypto`, tanpa `next/*` — ia diimpor `src/proxy.ts` (berjalan di
 * runtime edge) DAN penjaga halaman `lib/operator/guard.ts` (Node), dan diuji
 * langsung di `tests/operator-plane.test.ts`. JANGAN PERNAH mengimpor
 * `lib/platform-db.ts` dari sini — doktrin #137: penjaga & proxy bukan kode
 * penagihan.
 */

/** Keputusan perutean satu permintaan terhadap bidang operator. */
export type OperatorRouteDecision =
  /** Bukan urusan konsol operator — jalur pelanggan berjalan seperti biasa. */
  | { kind: "customer" }
  /** Halaman publik bidang operator (login, health) di host operator. */
  | { kind: "operator-public" }
  /** Halaman operator terlindungi di host operator — wajib sesi operator. */
  | { kind: "operator" }
  /** GAGAL-TERTUTUP: permintaan lintas-bidang. Jawab 404, tanpa penjelasan. */
  | { kind: "blocked" };

/** Huruf kecil + buang port — bentuk kanonis untuk membandingkan hostname. */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // `[::1]:3000` → `[::1]`; `ops.example.com:443` → `ops.example.com`.
  const withoutPort = trimmed.startsWith("[")
    ? trimmed.replace(/\]:[0-9]+$/, "]")
    : trimmed.replace(/:[0-9]+$/, "");
  return withoutPort || null;
}

/** `OPERATOR_HOST` yang sudah dinormalkan; null = konsol dimatikan. */
export function configuredOperatorHost(
  env: Record<string, string | undefined> = process.env
): string | null {
  return normalizeHost(env.OPERATOR_HOST);
}

export function isOperatorPath(pathname: string): boolean {
  return pathname === "/operator" || pathname.startsWith("/operator/");
}

/** Jalur bidang operator yang sah TANPA sesi operator (halaman login-nya). */
export function isOperatorPublicPath(pathname: string): boolean {
  return pathname === "/operator/login";
}

/**
 * Keputusan inti pemisahan bidang. Murni: (host permintaan, jalur, host
 * terkonfigurasi) → keputusan. Semua cabang yang ragu jatuh ke `blocked`.
 */
export function decideOperatorRouting(
  requestHost: string | null | undefined,
  pathname: string,
  operatorHost: string | null
): OperatorRouteDecision {
  const onOperatorPath = isOperatorPath(pathname);

  // Konsol tidak dikonfigurasi → rute operator tidak ada di host mana pun.
  if (!operatorHost) {
    return onOperatorPath ? { kind: "blocked" } : { kind: "customer" };
  }

  const host = normalizeHost(requestHost);

  if (host === operatorHost) {
    // Di host operator HANYA bidang operator (dan health probe untuk
    // load-balancer) yang hidup. Login pelanggan, dasbor, dan seluruh API
    // pelanggan = 404: sesi operator tidak boleh bisa membuka rute pelanggan.
    if (pathname === "/api/health") return { kind: "operator-public" };
    if (!onOperatorPath) return { kind: "blocked" };
    return isOperatorPublicPath(pathname) ? { kind: "operator-public" } : { kind: "operator" };
  }

  // Host pelanggan (atau host tak dikenal): rute operator tidak terjangkau.
  return onOperatorPath ? { kind: "blocked" } : { kind: "customer" };
}

/* ─────────────────────────── Daftar IP operator ─────────────────────────── */

/** Bawaan: satu proxy tepercaya di depan aplikasi — Traefik, dan hanya itu. */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Berapa banyak proxy TEPERCAYA yang berdiri di depan aplikasi
 * (`OPERATOR_TRUSTED_PROXY_HOPS`). Hari ini 1: Traefik. Menaruh Cloudflare,
 * CDN, atau load-balancer kedua di depannya menjadikannya 2 — dan angka itu
 * HARUS diperbarui bersamaan, sebab ia yang menentukan entri mana di
 * `x-forwarded-for` yang benar-benar ditulis oleh mesin milik kita.
 *
 * Nilai yang tidak masuk akal (bukan bilangan bulat, < 1) jatuh ke bawaan,
 * bukan ke 0: hop 0 berarti mempercayai entri paling kanan yang ditulis
 * KLIEN — persis lubang yang issue #162 tutup.
 */
export function trustedProxyHops(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.OPERATOR_TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return DEFAULT_TRUSTED_PROXY_HOPS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_TRUSTED_PROXY_HOPS;
  return value;
}

/**
 * Alamat klien dari header proxy — DIHITUNG DARI KANAN (issue #162).
 *
 * ══ KENAPA BUKAN ENTRI PERTAMA ═════════════════════════════════════════════
 * `x-forwarded-for` bertambah dari KIRI ke KANAN: setiap proxy MENAMBAHKAN
 * alamat lawan bicaranya di ujung kanan. Entri paling kiri karena itu bukan
 * "IP klien" melainkan "apa pun yang mula-mula ada di header itu" — dan yang
 * mula-mula ada di sana bisa saja diketik klien sendiri.
 *
 * Sebelum #162 fungsi ini mengambil entri PERTAMA. Itu benar hanya selama
 * Traefik MENIMPA header kiriman klien alih-alih menambahinya — dan Traefik
 * menimpanya hanya selama `forwardedHeaders.trustedIPs` kosong. Begitu
 * seseorang mengisi `trustedIPs` (persis yang dilakukan orang saat menaruh
 * Cloudflare atau load-balancer kedua di depan), Traefik mulai
 * MEMPERTAHANKAN header kiriman klien — dan entri pertama menjadi teks
 * pilihan penyerang:
 *
 *     X-Forwarded-For: <ip-yang-diizinkan>
 *
 * Perubahan itu terjadi di berkas konfigurasi infrastruktur, jauh dari berkas
 * ini, dan tidak ada satu pun tes yang akan berubah warna karenanya. Karena
 * itu yang diperbaiki bukan konfigurasinya melainkan CARA MEMBACANYA: dengan
 * menghitung dari kanan, sampah yang ditambahkan klien di depan tidak pernah
 * terbaca, berapa pun banyaknya.
 *
 * Entri ke-`hops` dari kanan adalah yang ditulis proxy TERLUAR yang masih
 * kita percayai. Dengan satu Traefik (hops = 1) itu entri paling kanan —
 * satu-satunya yang Traefik sendiri tulis, dan satu-satunya yang klien tidak
 * bisa sentuh.
 *
 * ══ GAGAL-TERTUTUP ═════════════════════════════════════════════════════════
 * Rantai yang LEBIH PENDEK dari `hops` berarti permintaan ini tidak melewati
 * jalur yang kita kira — misalnya menembus langsung ke Traefik, melewati CDN
 * yang seharusnya di depan. Itu tidak ditebak: null → `ipAllowed` menolak.
 *
 * `x-real-ip` hanya dipakai bila `x-forwarded-for` TIDAK ADA sama sekali, dan
 * hanya saat hops = 1. Dengan proxy berlapis, `x-real-ip` yang ditulis proxy
 * terdekat berisi alamat proxy SEBELUMNYA, bukan alamat klien — memakainya di
 * situ berarti membandingkan daftar IP operator dengan IP milik CDN.
 */
export function clientIpFrom(
  headers: {
    get(name: string): string | null;
  },
  env: Record<string, string | undefined> = process.env
): string | null {
  const hops = trustedProxyHops(env);

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    // Rantai lebih pendek dari yang dikonfigurasi → JANGAN menebak.
    return entries[entries.length - hops] ?? null;
  }

  if (hops > 1) return null;
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

function ipv4ToInt(ip: string): number | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!match) return null;
  let value = 0;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(match[i]);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** `::ffff:1.2.3.4` (IPv4 yang dipetakan ke IPv6) → `1.2.3.4`. */
function unmapIp(ip: string): string {
  const lower = ip.toLowerCase();
  return lower.startsWith("::ffff:") ? lower.slice(7) : lower;
}

function matchesEntry(ip: string, entry: string): boolean {
  const candidate = unmapIp(ip);
  const rule = unmapIp(entry);

  const slash = rule.indexOf("/");
  if (slash === -1) return candidate === rule;

  // CIDR — hanya IPv4; IPv6 harus didaftar sebagai alamat persis. Aturan
  // yang tidak bisa diurai TIDAK meloloskan siapa pun (gagal-tertutup).
  const base = ipv4ToInt(rule.slice(0, slash));
  const bits = Number(rule.slice(slash + 1));
  const target = ipv4ToInt(candidate);
  if (base === null || target === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return ((base & mask) >>> 0) === ((target & mask) >>> 0);
}

/**
 * Apakah IP ini boleh menyentuh bidang operator?
 *
 * `allowlistRaw` = isi `OPERATOR_IP_ALLOWLIST`: daftar koma berisi alamat
 * persis (IPv4/IPv6) dan/atau CIDR IPv4 (`10.0.0.0/8`). GAGAL-TERTUTUP:
 * tidak diset/kosong → false untuk semua; IP tidak diketahui → false.
 * `*` mengizinkan semua — pilihan eksplisit untuk pengembangan lokal, bukan
 * bawaan.
 */
export function ipAllowed(ip: string | null | undefined, allowlistRaw: string | undefined): boolean {
  const raw = allowlistRaw?.trim();
  if (!raw) return false;
  if (raw === "*") return true;
  if (!ip) return false;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => matchesEntry(ip, entry));
}

/* ─────────────────────────── Cookie sesi operator ────────────────────────── */

/**
 * Nama cookie sesi operator. Dengan HTTPS memakai awalan `__Host-` — browser
 * lalu MENOLAK cookie ini bila di-set dengan `Domain` atau dari jalur lain,
 * jadi ia tidak pernah bocor ke (atau dari) subdomain aplikasi pelanggan.
 * Pola kondisionalnya sama dengan cookie sesi Auth.js di `src/proxy.ts`.
 */
export function operatorCookieName(secure: boolean): string {
  return secure ? "__Host-sai_operator" : "sai_operator";
}
