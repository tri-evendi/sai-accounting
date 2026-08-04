/**
 * Isi/awetkan PAKET bawaan di `sai_platform` (issue #140).
 *
 *   bun run db:seed:plans
 *
 * Upsert berkunci `plans.key` — aman dijalankan berulang; harga & kuota paket
 * yang SUDAH ada tidak ditimpa diam-diam (pemasangan boleh mengubahnya lewat
 * basis data, dan seed yang menimpanya adalah kejutan penagihan). Hanya paket
 * yang BELUM ada yang dibuat.
 *
 * ══ SATU PENGECUALIAN: BENDERA KATALOG ═════════════════════════════════════
 * `is_public` / `contact_only` / `is_recommended` (migration platform 0008)
 * JUSTRU diselaraskan pada paket yang sudah ada. Ketiganya bukan angka
 * penagihan melainkan keputusan "apa yang dijual dan bagaimana ditampilkan",
 * dan bawaannya (`is_public = true`) berarti setiap paket lama — termasuk
 * `internal` milik penyedia — tampil di halaman harga publik sampai ada yang
 * mematikannya. Harga dan kuota tetap tidak pernah disentuh.
 *
 * ══ KATALOG YANG DIJUAL: trial · pro · enterprise ══════════════════════════
 * Paket publik lain (`starter`, `business`) DIPENSIUNKAN dari katalog dengan
 * `is_public = false`, BUKAN `is_active = false`: pelanggan yang sedang
 * berjalan di atasnya harus tetap sah — menonaktifkan paket yang masih dirujuk
 * langganan berarti menolak perpanjangannya sendiri. Pensiun = tidak
 * ditawarkan lagi; nonaktif = tidak boleh dipakai lagi. Keduanya berbeda, dan
 * hanya yang pertama yang menjadi keputusan penjualan.
 *
 * Harga IDR `Decimal(15,2)`. Ingat pola snapshot: angka di sini adalah harga
 * PENAWARAN untuk langganan baru — langganan berjalan memegang salinannya
 * sendiri (`subscriptions.price`, `tenants.max_*`) dan tidak berubah karena
 * baris ini berubah.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const DEFAULT_PLANS = [
  {
    /* Paket pemakaian INTERNAL penyedia (pt-sai lewat adopt-tenant, yang
     * plan_key bawaannya "internal"). Harga 0 dan trial 0: langganannya lahir
     * langsung `active` tanpa pernah menerbitkan tagihan bernominal — tanpa
     * baris paket ini, putaran adopsi yatim (#152) tidak pernah bisa
     * menyembuhkan tenant internal dan berbunyi galat di setiap putaran.
     *
     * `isPublic: false` — ia WAJIB aktif karena alasan di atas, dan justru
     * karena itu tidak boleh ikut terpajang: "Rp 0, 10 PT, 50 pengguna" adalah
     * penawaran yang tidak pernah dimaksudkan kepada siapa pun. */
    key: "internal",
    name: "Internal",
    description: "Pemakaian internal penyedia — tanpa tagihan.",
    priceMonthly: "0.00",
    maxCompanies: 10,
    maxUsers: 50,
    trialDays: 0,
    isPublic: false,
  },
  {
    key: "trial",
    name: "Trial",
    description: "Masa uji coba — satu PT, tiga pengguna.",
    priceMonthly: "0.00",
    maxCompanies: 1,
    maxUsers: 3,
    trialDays: 14,
    isPublic: true,
  },
  {
    /* Satu-satunya paket berbayar yang dijual swalayan. Angkanya DIWARISI dari
     * paket `business` yang digantikannya — bukan angka baru yang ditebak
     * skrip ini: harga adalah keputusan yang sudah pernah diambil, dan seed
     * tidak berwenang mengubahnya. Ubah lewat basis data bila memang berubah. */
    key: "pro",
    name: "Pro",
    description: "Sampai tiga PT, lima belas pengguna.",
    priceMonthly: "450000.00",
    priceYearly: "4500000.00",
    maxCompanies: 3,
    maxUsers: 15,
    trialDays: 14,
    isPublic: true,
    isRecommended: true,
  },
  {
    /* Harganya DIRUNDINGKAN. Kolom harga tetap 0 karena skema menuntut angka —
     * dan justru itulah kenapa `contactOnly` ada: tanpa bendera itu, kartu
     * harga memajang "Rp 0" dan tombol swalayan menghitung prorata dari nol,
     * yaitu menaikkan paket seseorang ke Enterprise tanpa bayaran. Penjaganya
     * ada di route `plan-change`, bukan hanya di tampilan.
     *
     * Kuota di sini hanya BAWAAN katalog: yang berlaku bagi tenant adalah
     * salinan di `tenants.max_*` yang dipasang saat paketnya diberikan, dan
     * angka itulah yang dirundingkan per pelanggan. */
    key: "enterprise",
    name: "Enterprise",
    description: "Kuota, dukungan, dan ketentuan yang dirundingkan.",
    priceMonthly: "0.00",
    maxCompanies: 10,
    maxUsers: 50,
    trialDays: 0,
    isPublic: true,
    contactOnly: true,
  },
] as const;

/**
 * Paket yang pernah dijual dan kini TIDAK ditawarkan lagi. Dipensiunkan dari
 * katalog (`is_public = false`), tidak pernah dinonaktifkan: lihat komentar
 * kepala berkas.
 */
const RETIRED_KEYS = ["starter", "business"] as const;

async function main() {
  const url = process.env.PLATFORM_DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "✗ PLATFORM_DATABASE_URL belum diset — tidak ada basis data platform untuk diisi."
    );
    process.exit(1);
  }

  const parsed = new URL(url);
  const platform = new PlatformClient({
    adapter: new PrismaMariaDb({
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      connectionLimit: 1,
    }),
  });

  for (const plan of DEFAULT_PLANS) {
    const existing = await platform.plan.findUnique({ where: { key: plan.key } });
    if (existing) {
      /* HANYA bendera katalog — harga & kuota milik pemasangan, bukan milik
       * skrip ini (lihat komentar kepala berkas). */
      const flags = {
        isPublic: plan.isPublic,
        contactOnly: "contactOnly" in plan ? plan.contactOnly : false,
        isRecommended: "isRecommended" in plan ? plan.isRecommended : false,
      };
      const drifted =
        existing.isPublic !== flags.isPublic ||
        existing.contactOnly !== flags.contactOnly ||
        existing.isRecommended !== flags.isRecommended;

      if (!drifted) {
        console.log(`= paket "${plan.key}" sudah ada — tidak disentuh`);
        continue;
      }
      await platform.plan.update({ where: { key: plan.key }, data: flags });
      console.log(
        `~ paket "${plan.key}" — bendera katalog diselaraskan ` +
          `(publik=${flags.isPublic}, rundingan=${flags.contactOnly}, disorot=${flags.isRecommended}); ` +
          "harga & kuota tidak disentuh"
      );
      continue;
    }
    await platform.plan.create({ data: { ...plan } });
    console.log(`+ paket "${plan.key}" dibuat`);
  }

  /* Pensiun dari katalog. `is_active` sengaja TIDAK disentuh: langganan yang
   * masih berjalan di atasnya harus tetap bisa diperpanjang. */
  for (const key of RETIRED_KEYS) {
    const existing = await platform.plan.findUnique({ where: { key } });
    if (!existing) continue;
    if (!existing.isPublic) {
      console.log(`= paket "${key}" sudah dipensiunkan`);
      continue;
    }
    await platform.plan.update({ where: { key }, data: { isPublic: false, isRecommended: false } });
    console.log(`- paket "${key}" dipensiunkan dari katalog (tetap aktif bagi pelanggan lama)`);
  }

  await platform.$disconnect();
}

main().catch((error) => {
  console.error("Seed paket gagal:", error);
  process.exit(1);
});
