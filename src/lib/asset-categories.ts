/**
 * Kategori aset tetap bawaan (issue #416) — DI LUAR `coa-seeding.ts`, dan itu
 * bukan kerapian.
 *
 * `coa-seeding.ts` memikul `import "server-only"`, dan paket itu tidak ada di
 * image `migrator` (dependensi yang disediakan Next, dipangkas di tahap itu).
 * Akibatnya setiap skrip CLI yang mengimpornya berhenti dengan
 * `Cannot find module 'server-only'` — termasuk `seed-asset-categories`, yang
 * justru ADA untuk dijalankan dari sana, di dalam jaringan compose, karena
 * `db:3306` tidak terjangkau dari shell host.
 *
 * Isi berkas ini memang tidak membutuhkan penanda itu: ia hanya bicara dengan
 * Prisma dan tidak menyentuh permintaan, sesi, maupun rahasia. Penandanya milik
 * modul yang tidak boleh sampai ke bundel klien; ini bukan salah satunya.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Kategori aset tetap BAWAAN — lahir bersama modul Aset Tetap (issue #416).
 *
 * ══ KENAPA INI HARUS ADA ═══════════════════════════════════════════════════
 * Impor aset tetap mencocokkan kolom "Kategori" ke kategori yang SUDAH ADA, dan
 * templat yang diunduh pengguna mencontohkan "Kendaraan" di kolom itu. Pada
 * perusahaan baru tabelnya kosong, jadi berkas yang mengikuti templat persis
 * ditolak baris demi baris — dengan saran "buat kategorinya di menu Aset Tetap",
 * sebuah menu yang gerbang setup memang belum izinkan dibuka. Aplikasi yang
 * menolak contohnya sendiri lalu menunjuk pintu yang ia kunci sendiri.
 *
 * ══ UMUR MANFAAT: KELOMPOK PAJAK, BUKAN ANGKA KARANGAN ═════════════════════
 * Mengikuti kelompok harta berwujud PMK 96/2009 — Kelompok 1 = 4 tahun (48
 * bulan), Kelompok 2 = 8 tahun (96), bangunan permanen 20 tahun (240). Ini
 * BAWAAN yang boleh diubah per kategori maupun per aset; yang penting ia
 * berangkat dari angka yang bisa dipertanggungjawabkan, bukan dari nol yang
 * akan membuat penyusutan membagi dengan nol pada putaran pertama.
 *
 * Ketiga akunnya memakai slot yang sama dengan `DEFAULT_MAPPINGS` — 120101
 * Peralatan & Mesin, 120102 Akumulasi Penyusutan, 610103 Beban Penyusutan —
 * sebab kategori memang menyalin bawaannya dari sana saat aset dibuat.
 */
export const DEFAULT_ASSET_CATEGORIES: ReadonlyArray<{
  name: string;
  defaultUsefulLifeMonths: number;
}> = [
  { name: "Bangunan", defaultUsefulLifeMonths: 240 },
  { name: "Kendaraan", defaultUsefulLifeMonths: 96 },
  { name: "Mesin & Peralatan", defaultUsefulLifeMonths: 96 },
  { name: "Peralatan Kantor", defaultUsefulLifeMonths: 48 },
  { name: "Komputer & Elektronik", defaultUsefulLifeMonths: 48 },
];

/** Kode akun yang dipakai kategori bawaan; sama dengan slot mapping aset tetap. */
const ASSET_CATEGORY_ACCOUNT_CODES = {
  asset: "120101",
  accumulated: "120102",
  expense: "610103",
} as const;

/**
 * Semai kategori bawaan — idempoten, dan DIAM bila akunnya belum ada.
 *
 * Cocokkan nama tanpa peduli huruf besar/kecil: kategori "kendaraan" yang
 * diketik sendiri oleh pengguna tidak boleh mendapat kembaran "Kendaraan" yang
 * hanya berbeda kapital, sebab pencocokan impor pun tidak membedakannya —
 * dua baris seperti itu membuat impor memilih salah satu tanpa bisa dijelaskan
 * kepada siapa pun.
 *
 * Akun yang tidak ada berarti modul Aset Tetap tidak dipakai perusahaan ini:
 * lewati tanpa galat, pola yang sama dengan `seedDefaultMappings`.
 */
export async function seedDefaultAssetCategories(client: Client): Promise<number> {
  const codes = Object.values(ASSET_CATEGORY_ACCOUNT_CODES);
  const accounts = await client.account.findMany({
    where: { code: { in: [...codes] } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(accounts.map((a) => [a.code, a.id]));

  const assetAccountId = idByCode.get(ASSET_CATEGORY_ACCOUNT_CODES.asset);
  const accumulatedAccountId = idByCode.get(ASSET_CATEGORY_ACCOUNT_CODES.accumulated);
  const expenseAccountId = idByCode.get(ASSET_CATEGORY_ACCOUNT_CODES.expense);
  if (!assetAccountId || !accumulatedAccountId || !expenseAccountId) return 0;

  const existing = await client.fixedAssetCategory.findMany({ select: { name: true } });
  const taken = new Set(existing.map((c) => c.name.trim().toLowerCase()));

  let created = 0;
  for (const category of DEFAULT_ASSET_CATEGORIES) {
    if (taken.has(category.name.toLowerCase())) continue;
    await client.fixedAssetCategory.create({
      data: {
        name: category.name,
        defaultMethod: "straight_line",
        defaultUsefulLifeMonths: category.defaultUsefulLifeMonths,
        assetAccountId,
        accumulatedAccountId,
        expenseAccountId,
        isActive: true,
      },
    });
    created++;
  }
  return created;
}
