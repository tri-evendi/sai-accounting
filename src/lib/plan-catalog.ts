/**
 * Katalog paket — daftar paket AKTIF yang boleh dilihat pelanggan.
 *
 * ══ KENAPA BERKAS SENDIRI, BUKAN DI `subscription-store` ═══════════════════
 * `subscription-store` menjawab "apa yang dimiliki SEBUAH tenant"; berkas ini
 * menjawab "apa yang DIJUAL". Yang kedua tidak bertenant sama sekali — tidak
 * ada `tenantId` di mana pun di bawah — dan mencampurnya ke dalam berkas yang
 * setiap fungsinya menerima `tenantId` adalah cara paling mudah agar suatu hari
 * ada query katalog yang diam-diam ikut menyaring per tenant, atau sebaliknya.
 *
 * ⚠ `isActive: false` TIDAK ikut. Paket yang sudah ditarik masih dipakai
 * pelanggan lama (langganan mereka menunjuk `plan_id` yang sama), jadi ia tidak
 * boleh dihapus — tapi juga tidak boleh ditawarkan lagi. Menampilkannya berarti
 * menawarkan harga yang tidak berlaku.
 *
 * ⚠ KUOTA DI SINI ADALAH KATALOG, BUKAN HAK. Penjaga kuota membaca
 * `tenants.max_companies`/`max_users` di basis data KENDALI (pola snapshot,
 * docs/MULTI-TENANT.md §5). Angka di tabel `plans` hanya disalin ke sana saat
 * paket sebuah tenant BERUBAH. Karena itu berkas ini tidak boleh dipakai untuk
 * memutuskan apa pun — ia hanya untuk dibaca manusia.
 *
 * `null` = platform tidak terjangkau. Penagihan mati tidak boleh mematikan
 * halaman yang menjelaskan keadaan langganan (pola yang sama dengan
 * `billingOverviewForTenant`): pemanggilnya menampilkan kalimat "tidak
 * terjangkau", bukan galat.
 */
import { platformDb } from "@/lib/platform-db";

export interface PlanOption {
  key: string;
  name: string;
  description: string | null;
  /** Harga per siklus dalam `currency`. Decimal → number DI SINI, sekali. */
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
  maxCompanies: number;
  maxUsers: number;
}

export async function activePlans(): Promise<PlanOption[] | null> {
  try {
    const plans = await platformDb.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
      select: {
        key: true,
        name: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        currency: true,
        maxCompanies: true,
        maxUsers: true,
      },
    });

    return plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: plan.priceYearly === null ? null : Number(plan.priceYearly),
      currency: plan.currency,
      maxCompanies: plan.maxCompanies,
      maxUsers: plan.maxUsers,
    }));
  } catch {
    return null;
  }
}
