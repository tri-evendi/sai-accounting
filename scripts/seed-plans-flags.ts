/**
 * Bendera katalog yang DISELARASKAN `db:seed:plans` pada paket yang SUDAH ada —
 * murni, dipisah dari `seed-plans.ts` supaya teruji tanpa basis data
 * (mengimpor `seed-plans.ts` akan menjalankan `main()`).
 *
 * ══ `is_public` TIDAK LAGI IKUT ═══════════════════════════════════════════
 * Sampai perubahan ini `is_public` ikut diselaraskan setiap rilis (alasannya
 * dulu: bawaan kolom `true` memajang paket lama seperti `internal` sampai ada
 * yang mematikannya — sudah tertutup oleh migration 0008/0010 di setiap
 * pemasangan berjalan). Sejak operator bisa menyembunyikan/menampilkan paket
 * dari konsol `/plans` (alur demo-first), menyelaraskannya berarti setiap
 * rilis — yang menjalankan `bun run db:seed:plans` — diam-diam MEMBATALKAN
 * keputusan penjualan operator. Jadi `is_public` kini hanya dipasang saat
 * paket DIBUAT; sesudah itu ia milik konsol.
 *
 * `contact_only`, `is_recommended`, dan `trial_days` tetap diselaraskan:
 * ketiganya belum punya penyunting di konsol, jadi seed tetap sumbernya.
 */

export interface SeedCatalogPlan {
  contactOnly?: boolean;
  isRecommended?: boolean;
  trialDays: number;
}

export interface ExistingCatalogFlags {
  contactOnly: boolean;
  isRecommended: boolean;
  trialDays: number;
}

export interface CatalogFlagUpdate {
  contactOnly: boolean;
  isRecommended: boolean;
  trialDays: number;
}

/**
 * Bendera yang harus ditulis ke paket yang sudah ada, atau `null` bila tidak
 * ada yang menyimpang. Tidak pernah memuat `isPublic` — tipe kembaliannya
 * yang menjaminnya, bukan ingatan pemanggil.
 */
export function catalogFlagSync(
  existing: ExistingCatalogFlags,
  plan: SeedCatalogPlan
): CatalogFlagUpdate | null {
  const flags: CatalogFlagUpdate = {
    contactOnly: plan.contactOnly ?? false,
    isRecommended: plan.isRecommended ?? false,
    trialDays: plan.trialDays,
  };
  const drifted =
    existing.contactOnly !== flags.contactOnly ||
    existing.isRecommended !== flags.isRecommended ||
    existing.trialDays !== flags.trialDays;
  return drifted ? flags : null;
}
