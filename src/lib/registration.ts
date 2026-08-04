/**
 * Pendaftaran mandiri (issue #138) — LOGIKA MURNI perjalanan §7.1
 * docs/MULTI-TENANT.md. Tanpa React/Prisma/next; diuji di
 * `tests/registration.test.ts`. Sambungan basis datanya di
 * `registration-store.ts`, permukaannya di `/register` + `/verify-email`.
 *
 * ══ KENAPA "PENDING" HIDUP DI TABEL `registrations`, BUKAN DI `tenants` ═════
 * Verifikasi email adalah GERBANG penyediaan (§9): sebelum tautan diklik tidak
 * boleh ada apa pun yang lahir — bukan basis data, bukan baris `users` yang
 * menempati email unik, bukan tenant kosong yang harus dibersihkan tukang
 * sapu. Tenant + User(owner) + TenantMembership(owner) lahir SEKALIGUS, satu
 * transaksi, saat verifikasi — kegagalan di tengah tidak menyisakan akun tanpa
 * tenant (§4A). Nilai status `pending_verification` tetap ada di enum untuk
 * tenant yang dibuat operator secara manual sebelum pemiliknya memverifikasi;
 * jalur pendaftaran mandiri tidak pernah menyentuhnya.
 */

import { createHash, randomBytes } from "node:crypto";

import { TENANT_STATUSES, type TenantStatus } from "@/lib/constants";

/** Umur tautan verifikasi: 24 jam — pendaftar tidak selalu membuka surelnya
 *  saat itu juga; lebih lama hanya memperpanjang umur hash kata sandi yang
 *  menganggur di tabel pendaftaran. */
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Lama masa uji-coba tenant baru: SNAPSHOT dari bawaan paket `trial`
 * (`plans.trial_days`, issue #137) — disalin, bukan dibaca dari basis data
 * platform saat mendaftar: pendaftaran harus tetap bekerja saat
 * `sai_platform` sedang mati (§4A: penagihan mati ≠ orang berhenti bisa
 * masuk), dan mengubah paket tidak boleh diam-diam mengubah tenant berjalan.
 *
 * ⚠ ANGKA INI HIDUP DI DUA TEMPAT, dan keduanya harus bergerak bersamaan:
 * konstanta di sini (dipakai jalur PENDAFTARAN MANDIRI) dan `plans.trial_days`
 * di basis data platform (dibaca `subscription-lifecycle` & `operator/writes`
 * untuk langganan yang lahir dari jalur lain). Kalau berbeda, dua pelanggan
 * yang mendaftar lewat pintu berbeda mendapat masa uji coba berbeda — dan
 * tidak ada yang berbunyi. `scripts/seed-plans.ts` memegang sisi basis
 * datanya.
 */
export const TRIAL_DAYS = 7;

export function trialEndsAtFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** SHA-256 hex — bentuk yang disimpan; token mentah hanya hidup di surel. */
export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintVerificationToken(now: Date = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
  };
}

export type VerificationVerdict = "valid" | "not_found" | "used" | "expired";

/** Keputusan MURNI atas satu baris pendaftaran (atau ketiadaannya) —
 *  semantik yang sama dengan token atur-ulang kata sandi (#136). */
export function verdictForVerification(
  row: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date = new Date()
): VerificationVerdict {
  if (!row) return "not_found";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/** Status tenant hasil verifikasi — transisi §7.4 dimulai dari `trialing`. */
export const STATUS_AFTER_VERIFICATION: TenantStatus = "trialing";

/**
 * Slug tenant dari nama pendaftar: huruf kecil/angka/tanda hubung, tanpa tepi
 * menggantung, maksimal 40 (menyisakan ruang akhiran anti-tabrakan di bawah
 * batas kolom 50). Nama yang tak menyisakan apa pun jatuh ke "tenant".
 */
export function tenantSlugFrom(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "tenant";
}

/**
 * Kandidat slug berurutan untuk menghindari tabrakan: `budi`, `budi-2` …
 * `budi-9`, lalu akhiran acak. Deterministik di sembilan percobaan pertama
 * supaya bisa diuji; keunikan sesungguhnya tetap dijaga indeks unik DB.
 */
export function tenantSlugCandidates(name: string, randomSuffix?: string): string[] {
  const base = tenantSlugFrom(name);
  const suffix = randomSuffix ?? randomBytes(3).toString("hex");
  return [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`), `${base}-${suffix}`];
}

/** Username tampilan dari email — bagian lokal yang disederhanakan. Tidak
 *  perlu unik (issue #136): sekadar nama panggilan awal yang masuk akal. */
export function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]+/g, "").slice(0, 50);
  return cleaned || "pengguna";
}

/**
 * ── Gerbang kuota & status di depan penyediaan (issue #138) ────────────────
 *
 * Diperiksa DI SERVER pada `POST /api/companies`, bukan disembunyikan di UI:
 * dengan pendaftaran mandiri, siapa pun bisa meminta pembuatan sebuah basis
 * data — kurva ongkos §9 — jadi pagarnya harus berdiri di tempat yang tidak
 * bisa dilewati.
 *
 * `maxCompanies` adalah SNAPSHOT di baris tenant (#134): mengubah paket tidak
 * diam-diam mempersempit tenant berjalan. Status di luar `trialing`/`active`
 * tidak boleh menumbuhkan buku baru — `suspended` berarti hanya-baca (§7.4),
 * bukan tempat menambah kewajiban penyimpanan baru.
 */
export type ProvisionRefusal = "tenant_not_active" | "company_quota_reached" | null;

export function refuseProvisioning(tenant: {
  status: string;
  maxCompanies: number;
  companyCount: number;
}): ProvisionRefusal {
  const active: readonly TenantStatus[] = ["trialing", "active"];
  if (
    !(TENANT_STATUSES as readonly string[]).includes(tenant.status) ||
    !(active as readonly string[]).includes(tenant.status)
  ) {
    return "tenant_not_active";
  }
  if (tenant.companyCount >= tenant.maxCompanies) return "company_quota_reached";
  return null;
}
