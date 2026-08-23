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
export const TRIAL_DAYS = 14;

/**
 * Paket tempat pendaftar baru MENDARAT — dan sejak keputusan ini, itu paket
 * BERBAYAR (`pro`), bukan paket gratis tersendiri.
 *
 * ══ KENAPA BUKAN PAKET `trial` LAGI ════════════════════════════════════════
 * Sebelumnya pendaftar lahir di paket `trial`: harga Rp 0, kuota 1 PT / 3
 * pengguna. Akibatnya bukan sekadar penamaan yang aneh, melainkan corong yang
 * tidak pernah bermuara. Saat uji cobanya habis, penjadwal memindahkan
 * langganan ke `active` dan menerbitkan tagihan pertama sebesar HARGA
 * SNAPSHOT-nya — yaitu Rp 0. Pelanggan lalu duduk selamanya sebagai pengguna
 * gratis berkuota terkecil, tanpa pernah diminta membayar dan tanpa pernah
 * mencicipi apa yang dijual.
 *
 * Uji coba kini benar-benar UJI COBA PAKET PRO: langganannya lahir di `pro`
 * dengan status `trialing`, kuota Pro, dan pada hari ke-{TRIAL_DAYS} tagihan
 * pertamanya adalah harga Pro yang sebenarnya. Tidak dibayar → menunggak →
 * ditangguhkan (hanya-baca, buku tetap bisa diunduh).
 *
 * ⚠ KUOTA DI SINI ADALAH SNAPSHOT, sama seperti `TRIAL_DAYS`. Pendaftaran
 * sengaja TIDAK membaca `sai_platform` (pendaftaran harus tetap bekerja saat
 * penagihan mati), jadi angka Pro disalin ke sini. `scripts/seed-plans.ts`
 * memegang sisi basis datanya DAN memperingatkan bila keduanya menyimpang —
 * dua sumber yang diam-diam berbeda berarti kuota yang dijanjikan halaman
 * harga bukan kuota yang benar-benar diberikan.
 */
export const SIGNUP_PLAN_KEY = "pro";
export const SIGNUP_MAX_COMPANIES = 3;
export const SIGNUP_MAX_USERS = 15;

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
 * Slug tenant dari nama AKUN: huruf kecil/angka/tanda hubung, tanpa tepi
 * menggantung, maksimal 40 (menyisakan ruang akhiran anti-tabrakan di bawah
 * batas kolom 50). Nama yang tak menyisakan apa pun jatuh ke "tenant".
 *
 * ⚠ Sejak #458 yang masuk ke sini adalah nama AKUN, bukan nama ORANG. Alasan
 * lengkapnya di badan issue itu; bentuk pendeknya: alamat setiap buku dibaca
 * staf dan akuntan eksternal, dan nama pribadi di sana adalah data pribadi
 * yang tersebar ke log, riwayat peramban, dan header `Referer` tanpa satu pun
 * orang memutuskannya.
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
 * Abjad slug acak: TANPA huruf & angka yang saling menyamar (0/o, 1/l/i).
 *
 * Slug ini akan dibacakan lewat telepon dan diketik ulang dari tangkapan layar
 * WhatsApp; sepasang karakter yang mirip di sana berarti satu pelanggan yang
 * mendarat di 404 dan menyangka bukunya hilang.
 */
const ABJAD_ACAK = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Slug acak — CADANGAN, bukan bawaan.
 *
 * ⚠ ACAK, bukan HASH dari email/nama. Hash bukan penyamaran: siapa pun yang
 * tahu alamat surel target bisa menghitung hash yang sama dan membuktikan akun
 * itu ada — pseudonim yang bisa diverifikasi, bukan rahasia. Yang di sini
 * ditarik dari `randomBytes`, jadi ia tidak bisa dihubungkan kembali ke apa pun
 * tanpa membaca baris tenantnya.
 *
 * Delapan karakter dari abjad 31 huruf ≈ 40 bit — jauh lebih dari cukup untuk
 * ruang nama sebesar daftar pelanggan, dan tetap pendek untuk dibacakan.
 */
export function slugAcak(panjang = 8): string {
  const bytes = randomBytes(panjang);
  let keluar = "";
  for (let i = 0; i < panjang; i += 1) {
    keluar += ABJAD_ACAK[bytes[i] % ABJAD_ACAK.length];
  }
  return keluar;
}

/**
 * Kandidat slug: nama akunnya, lalu nama + AKHIRAN ACAK bila sudah dipakai.
 *
 * ══ KENAPA BUKAN `-2`, `-3`, `-4` ══════════════════════════════════════════
 * Deret berurutan MEMBOCORKAN keberadaan akun lain. Dua orang bernama "Budi
 * Santoso" mendaftar; yang kedua mendapat `budi-santoso-2` dan seketika tahu
 * bahwa seorang Budi Santoso lain sudah menjadi pelanggan kami — dan pada
 * angka `-6`, bahwa ada lima. Kebocoran itu bukan hipotesis: `rika-mutiara-indah-2`
 * ada di produksi saat kalimat ini ditulis.
 *
 * Akhiran ACAK menutupnya tanpa mengubah apa pun yang lain: `budi-santoso-k7f3`
 * masih terbaca sebagai milik siapa oleh penerima tautannya, dan tidak
 * mengatakan apa pun tentang pendaftar lain.
 *
 * ⚠ ACAK, bukan hashid dari `tenants.id`. Hashid tidak pernah tabrakan dan
 * bisa dibaca balik saat dukungan — tetapi ia BISA dibaca balik: `tenants.id`
 * autoincrement, jadi akhirannya memajang urutan pendaftaran di alamat setiap
 * pelanggan begitu garamnya diketahui. Keunikan yang dijaminnya pun tidak
 * menghemat apa-apa di sini: slug boleh dipilih sendiri (`/platform/account`),
 * jadi pemeriksaan keunikan tetap harus berdiri.
 *
 * Nama yang tidak menyisakan satu pun huruf/angka (mis. hanya emoji) jatuh ke
 * slug acak PENUH — bukan "tenant", "tenant-2", yang tidak berarti apa-apa bagi
 * pemiliknya dan menumpuk di ruang nama bersama.
 *
 * `randomSuffix` hanya untuk pengujian; keunikan sesungguhnya tetap dijaga
 * indeks unik DB.
 */
export function tenantSlugCandidates(name: string, randomSuffix?: string): string[] {
  const base = tenantSlugFrom(name);
  if (base === "tenant") return [slugAcak(), slugAcak(), slugAcak()];
  /* Tiga percobaan: satu tanpa akhiran, dua dengan akhiran acak. Peluang dua
     akhiran 4-karakter dari 31 huruf tertabrak berturut-turut ≈ 1 : 850 juta;
     kalau toh terjadi, indeks unik DB yang menolak — bukan slug diam-diam
     kembar. */
  return [base, `${base}-${randomSuffix ?? slugAcak(4)}`, `${base}-${slugAcak(4)}`];
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
