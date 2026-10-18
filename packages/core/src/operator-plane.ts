/**
 * BIDANG OPERATOR (issue #154) — logika MURNI pemisahan bidang autentikasi
 * konsol operator dari aplikasi pelanggan.
 *
 * Konsol operator hidup di HOSTNAME SENDIRI (`OPERATOR_HOST`) di luar lingkup
 * cookie aplikasi pelanggan: sesi pelanggan yang bocor tidak pernah sampai ke
 * konsol, dan sebaliknya. Dulu konsol berupa grup rute `(operator)` di
 * aplikasi yang SAMA (keputusan #154), dengan awalan `/operator`; kini ia
 * aplikasi sendiri di host sendiri, tanpa awalan. PEMERIKSAAN HOST tetap yang
 * menegakkan pemisahan bidangnya, dan ia WAJIB GAGAL-TERTUTUP:
 *
 *   • `OPERATOR_HOST` tidak diset → konsol TIDAK TERJANGKAU di host mana pun
 *     — bukan terbuka-diam-diam.
 *   • Host pelanggan tidak pernah mencapai konsol; host operator tidak pernah
 *     mencapai rute pelanggan (dasbor, login pelanggan, API) — sejak monorepo
 *     Fase 3d keduanya aplikasi & image terpisah, dan modul ini yang membuat
 *     keduanya sepakat host mana milik siapa.
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

/**
 * Keputusan perutean satu permintaan terhadap bidang operator.
 *
 * Sejak konsol menjadi aplikasi sendiri (monorepo Fase 3d) dan kehilangan
 * awalan `/operator`, bidangnya ditentukan HOST saja — jalur tidak lagi
 * membawa informasi bidang. Putusan `blocked` (lintas-bidang menurut jalur)
 * karena itu tidak ada lagi: aplikasi pelanggan tidak punya rute konsol, dan
 * aplikasi konsol tidak punya rute pelanggan; masing-masing menjawab 404 untuk
 * bidang yang bukan miliknya.
 */
export type OperatorRouteDecision =
  /** Bukan host konsol (atau konsol dimatikan) — bidang pelanggan. */
  | { kind: "customer" }
  /** Host konsol, jalur publik (masuk, probe health) — tanpa sesi operator. */
  | { kind: "operator-public" }
  /** Host konsol, jalur terlindungi — wajib sesi operator. */
  | { kind: "operator" };

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

/** Jalur konsol yang sah TANPA sesi operator: halaman masuk dan probe health. */
export function isOperatorPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/health";
}

/**
 * Keputusan inti pemisahan bidang. Murni: (host permintaan, jalur, host
 * terkonfigurasi) → keputusan. GAGAL-TERTUTUP: `OPERATOR_HOST` tidak diset →
 * tidak ada satu host pun yang menjadi host konsol (`customer` di mana-mana,
 * dan aplikasi konsol menjawab 404 untuk `customer`).
 */
export function decideOperatorRouting(
  requestHost: string | null | undefined,
  pathname: string,
  operatorHost: string | null
): OperatorRouteDecision {
  if (!operatorHost || normalizeHost(requestHost) !== operatorHost) return { kind: "customer" };
  return isOperatorPublicPath(pathname) ? { kind: "operator-public" } : { kind: "operator" };
}

/* ─────────────────────────── Daftar IP operator ─────────────────────────── */

/*
 * `DEFAULT_TRUSTED_PROXY_HOPS`, `trustedProxyHops`, dan `clientIpFrom` PINDAH
 * ke `lib/client-ip.ts` di issue #372 — mereka tidak pernah benar-benar milik
 * bidang operator. Delapan permukaan PELANGGAN membaca alamat klien sendiri
 * dengan `x-forwarded-for.split(",")[0]`, yaitu entri yang justru bisa diketik
 * klien, dan memperbaikinya menuntut satu pembaca bersama — bukan salinan
 * kesembilan.
 *
 * Di-ekspor ulang di sini supaya setiap pemanggil lama (`proxy.ts`,
 * `operator/guard.ts`, aksi konsol) dan tesnya tidak perlu berubah sama sekali.
 * Nama variabel environment-nya SENGAJA tetap `OPERATOR_TRUSTED_PROXY_HOPS`:
 * ia menggambarkan topologi pemasangan, bukan bidang operator, dan menggantinya
 * berarti setiap pemasangan yang sudah berjalan diam-diam kembali ke bawaan
 * pada hari deploy berikutnya.
 */
export { DEFAULT_TRUSTED_PROXY_HOPS, clientIpFrom, trustedProxyHops } from "@sai/core/client-ip";

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
