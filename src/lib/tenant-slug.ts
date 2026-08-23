/**
 * GANTI SLUG AKUN — aturan, pagar, dan penulisannya (issue #458 lingkup 3).
 *
 * ══ KENAPA INI PEKERJAAN TERSENDIRI, BUKAN "SEKALIAN GANTI NAMA" ═══════════
 * Nama tampilan tidak dipegang siapa pun selain layar. Slug dipegang oleh:
 * bookmark, surel undangan yang SUDAH terkirim, riwayat peramban, dan tautan
 * yang dibagikan ke akuntan eksternal. Menggantinya berarti memutus semuanya —
 * kecuali kalau alamat lamanya tetap sampai, dan itulah yang `TenantSlugHistory`
 * kerjakan.
 *
 * ══ TIGA PAGAR, DAN SEBAB MASING-MASING ════════════════════════════════════
 *  1. **Slug lama DIPESAN selamanya.** Ia tidak pernah dilepas untuk akun
 *     lain: slug lama yang bisa diambil orang berarti sebuah tautan lama yang
 *     mendarat di buku MILIK ORANG LAIN — dan pemiliknya tidak akan pernah
 *     tahu ia kedatangan tamu yang salah alamat. Dijaga `@unique` di DB, bukan
 *     hanya di fungsi ini.
 *  2. **Sekali per 30 hari.** Bukan untuk menyulitkan: setiap penggantian
 *     memesan satu slug selamanya dan memutus tautan yang belum sempat
 *     diperbarui siapa pun. Orang yang mengganti alamatnya tiga kali seminggu
 *     sedang mencari nama, bukan memindahkan akun.
 *  3. **Bentuknya diperiksa sebelum apa pun disentuh** — pola yang sama dengan
 *     slug perusahaan.
 *
 * ⚠ AMAN dari sisi basis data, dan itu yang membuat lingkup ini murah: nama
 * basis data berbentuk `sai_t{tenantId}_{companySlug}` — memuat **id** tenant,
 * BUKAN slug-nya. Mengganti slug tenant karena itu tidak menyentuh satu basis
 * data pun. (Slug PERUSAHAAN sebaliknya: ia ada di nama basis datanya, dan
 * karena itu memang abadi — lihat `companies.slug` di skema kendali.)
 *
 * MURNI + satu penulis: bagian keputusannya bisa diuji tanpa basis data, dan
 * `renameTenantSlug` adalah satu-satunya jalan menulisnya (dipakai halaman
 * pengaturan MAUPUN skrip operator untuk akun lama — lingkup 4).
 */

import { controlDb } from "@/lib/control-db";
import { isValidSlug } from "@/lib/tenant-routes";

/** Jeda wajib antar-penggantian. */
export const JEDA_GANTI_SLUG_HARI = 30;

/**
 * Slug yang tidak boleh dipakai siapa pun.
 *
 * Bukan karena bentrok rute — slug tenant hidup di bawah `/t/`, jadi ia tidak
 * bisa menabrak `/login` maupun `/docs`. Alasannya penyamaran: sebuah akun
 * bernama `admin` atau `support` bisa dipakai meyakinkan orang bahwa tautannya
 * datang dari kami.
 */
export const SLUG_TERLARANG: readonly string[] = [
  "admin",
  "administrator",
  "api",
  "billing",
  "help",
  "operator",
  "platform",
  "root",
  "sai",
  "security",
  "support",
  "system",
  "tenant",
];

export type PenolakanSlug =
  | "bentuk"
  | "terlarang"
  | "sama"
  | "dipakai"
  | "terlalu-sering";

/** Keputusan MURNI: boleh atau tidak, tanpa menyentuh basis data. */
export function tolakGantiSlug(input: {
  slugBaru: string;
  slugSekarang: string;
  slugChangedAt: Date | null;
  /** Sudah terpakai tenant lain ATAU terpesan di riwayat. */
  sudahDipakai: boolean;
  now?: Date;
}): PenolakanSlug | null {
  const { slugBaru, slugSekarang, slugChangedAt, sudahDipakai } = input;

  /*
   * ⚠ Lebih ketat daripada `isValidSlug`, dengan sengaja. Pola bersama
   * (`/^[a-z0-9-]{2,50}$/`) menerima `-movin`, `movin-`, dan `--`: ia dipakai
   * juga untuk MEMBACA jalur, tempat menolak bentuk yang aneh cukup dilakukan
   * dengan 404 dan mengetatkannya berisiko menolak slug yang sudah terlanjur
   * ada. Di sini kita sedang MEMBUAT slug, dan slug bertanda hubung menggantung
   * terbaca seperti potongan alamat yang rusak — sekali dipasang, ia dipesan
   * selamanya.
   */
  if (!isValidSlug(slugBaru) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugBaru)) return "bentuk";
  if (SLUG_TERLARANG.includes(slugBaru)) return "terlarang";
  if (slugBaru === slugSekarang) return "sama";
  if (sudahDipakai) return "dipakai";

  if (slugChangedAt) {
    const now = input.now ?? new Date();
    const jeda = JEDA_GANTI_SLUG_HARI * 24 * 60 * 60 * 1000;
    if (now.getTime() - slugChangedAt.getTime() < jeda) return "terlalu-sering";
  }

  return null;
}

/** Kapan slug boleh diganti lagi; `null` bila sekarang juga. */
export function bolehGantiLagi(slugChangedAt: Date | null): Date | null {
  if (!slugChangedAt) return null;
  const berikutnya = new Date(
    slugChangedAt.getTime() + JEDA_GANTI_SLUG_HARI * 24 * 60 * 60 * 1000
  );
  return berikutnya.getTime() > Date.now() ? berikutnya : null;
}

export type HasilGantiSlug =
  | { ok: true; slugLama: string; slugBaru: string }
  | { ok: false; reason: PenolakanSlug | "tidak-ada" };

/**
 * Ganti slug — SATU-SATUNYA penulisnya.
 *
 * Seluruhnya di dalam satu transaksi: slug lama masuk riwayat DAN slug baru
 * dipasang, atau tidak sama sekali. Urutan terbalik (pasang dulu, catat
 * belakangan) meninggalkan lubang di mana alamat lama sudah mati tetapi belum
 * tercatat sebagai milik siapa pun — dan di lubang itu ia bisa diambil orang.
 */
export async function renameTenantSlug(input: {
  tenantId: number;
  slugBaru: string;
  now?: Date;
}): Promise<HasilGantiSlug> {
  const slugBaru = input.slugBaru.trim().toLowerCase();
  const now = input.now ?? new Date();

  return controlDb.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: input.tenantId },
      select: { slug: true, slugChangedAt: true },
    });
    if (!tenant) return { ok: false as const, reason: "tidak-ada" as const };

    /* Terpakai = slug tenant lain ATAU slug yang pernah dipakai siapa pun —
       termasuk slug lama MILIK SENDIRI: memakainya kembali membuat satu alamat
       menunjuk dua keadaan yang berbeda pada dua masa. */
    const [bentrokTenant, bentrokRiwayat] = await Promise.all([
      tx.tenant.findUnique({ where: { slug: slugBaru }, select: { id: true } }),
      tx.tenantSlugHistory.findUnique({ where: { slug: slugBaru }, select: { id: true } }),
    ]);

    const tolakan = tolakGantiSlug({
      slugBaru,
      slugSekarang: tenant.slug,
      slugChangedAt: tenant.slugChangedAt,
      sudahDipakai: bentrokTenant !== null || bentrokRiwayat !== null,
      now,
    });
    if (tolakan) return { ok: false as const, reason: tolakan };

    await tx.tenantSlugHistory.create({
      data: { tenantId: input.tenantId, slug: tenant.slug },
    });
    await tx.tenant.update({
      where: { id: input.tenantId },
      data: { slug: slugBaru, slugChangedAt: now },
    });

    return { ok: true as const, slugLama: tenant.slug, slugBaru };
  });
}

/**
 * Slug LAMA → tenant pemiliknya, untuk memantulkan alamat yang sudah usang.
 *
 * ⚠ Pemanggilnya WAJIB memastikan pemanggil memang anggota tenant itu sebelum
 * memantulkan. Tanpa itu, siapa pun bisa menukar-nukar slug untuk memetakan
 * "alamat lama X sekarang bernama Y" — kebocoran yang tidak terlihat sebagai
 * kebocoran. Jalur masuknya (`enterCompanyFromRoute`) melakukan pemeriksaan itu.
 */
export async function tenantIdUntukSlugLama(slug: string): Promise<number | null> {
  if (!isValidSlug(slug)) return null;
  const baris = await controlDb.tenantSlugHistory.findUnique({
    where: { slug },
    select: { tenantId: true },
  });
  return baris?.tenantId ?? null;
}
