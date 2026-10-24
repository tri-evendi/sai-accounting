/**
 * PAKET TAMPIL / TERSEMBUNYI di katalog publik — `plans.is_public`.
 *
 * Satu-satunya tulisan konsol ke katalog paket. Harga & kuota TETAP milik
 * `docs/PRICING.md` + `bun run db:seed:plans` (lihat `plansForOperatorCatalog`);
 * yang dibuka di sini hanya keputusan PENJUALAN "paket ini ditawarkan atau
 * tidak" — keputusan yang di alur demo-first berubah per pelanggan, bukan per
 * rilis. Karena itu `db:seed:plans` sejak perubahan ini TIDAK lagi menimpa
 * `is_public` paket yang sudah ada (`scripts/seed-plans-flags.ts`).
 *
 * `is_public` dibaca dua tempat, dan keduanya ikut berubah:
 *   • katalog publik (`activePlans()`: seksi harga `/`, `/pricing`);
 *   • pindah paket swalayan tenant (`api/tenant/billing/plan-change`).
 *
 * KLIENNYA DISUNTIKKAN supaya aturannya teruji tanpa basis data.
 */

import { bumpCacheSignal } from "@sai/platform/cache-signals";

/** Seminimal yang dibutuhkan penulis ini dari klien Prisma platform. Model
 *  `cacheSignal` tidak dituntut tipe: `bumpCacheSignal` memeriksanya sendiri
 *  saat berjalan (klien tiruan tanpa model = sinyal dilewati). */
export interface PlanVisibilityDb {
  plan: {
    findUnique: (args: {
      where: { id: number };
      select: { key: true; isPublic: true; priceMonthly: true; contactOnly: true };
    }) => Promise<{
      key: string;
      isPublic: boolean;
      priceMonthly: { toString(): string } | number | string;
      contactOnly: boolean;
    } | null>;
    update: (args: { where: { id: number }; data: { isPublic: boolean } }) => Promise<unknown>;
  };
}

export type PlanVisibilityResult =
  | { outcome: "ok"; key: string; from: boolean; to: boolean }
  /** Sudah dalam keadaan yang diminta — tidak ditulis, tidak dicatat. */
  | { outcome: "unchanged"; key: string }
  | { outcome: "not_found" }
  /**
   * Paket ber-HARGA NOL yang bukan rundingan (`internal` milik penyedia) tidak
   * boleh dipajang: "Rp 0, 10 PT" bukan penawaran untuk siapa pun, dan karena
   * `plan-change` menuntut `is_public`, memajangnya membuka jalan swalayan
   * tenant pindah ke paket gratis.
   */
  | { outcome: "free_plan"; key: string };

export async function setPlanPublic(
  db: PlanVisibilityDb,
  input: { planId: number; isPublic: boolean }
): Promise<PlanVisibilityResult> {
  const plan = await db.plan.findUnique({
    where: { id: input.planId },
    select: { key: true, isPublic: true, priceMonthly: true, contactOnly: true },
  });
  if (!plan) return { outcome: "not_found" };
  if (plan.isPublic === input.isPublic) return { outcome: "unchanged", key: plan.key };
  if (input.isPublic && !plan.contactOnly && Number(plan.priceMonthly.toString()) <= 0) {
    return { outcome: "free_plan", key: plan.key };
  }
  await db.plan.update({ where: { id: input.planId }, data: { isPublic: input.isPublic } });
  /* Katalog publik di `app-customer` di-cache per versi sinyal ini — tanpa
     menaikkannya paket yang disembunyikan tetap tampil sampai umur cache
     habis. */
  await bumpCacheSignal(db, "plan-catalog");
  return { outcome: "ok", key: plan.key, from: plan.isPublic, to: input.isPublic };
}
