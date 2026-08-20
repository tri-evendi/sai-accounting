/**
 * Menyemai bagan akun untuk MODUL yang benar-benar dipakai (issue #99/#104).
 *
 * ══ MASALAH YANG DIBERESKAN ════════════════════════════════════════════════
 * Sebelum ini penyemaian hanya ada di `scripts/seed-coa.ts` — sebuah perintah
 * baris perintah yang menyemai SELURUH template ke SATU basis data. Dua
 * akibatnya baru terasa setelah aplikasi jadi multi-PT:
 *
 *  1. Perusahaan yang dibuat dari halaman "Tambah Perusahaan" tidak mendapat
 *     satu akun pun — tidak ada yang menjalankan skrip itu untuknya.
 *  2. Perusahaan JASA, yang modul persediaannya memang sudah dimatikan
 *     kategori usahanya, tetap mendapat "Persediaan Barang Dagang", "Beban
 *     Pokok Penjualan", dan "Selisih Persediaan" — akun yang selamanya nol
 *     tapi ikut memenuhi setiap pemilih akun dan setiap laporan.
 *
 * ══ IDEMPOTEN, DAN ITU YANG MEMBUATNYA AMAN DIPANGGIL DUA KALI ═════════════
 * Akun yang kodenya sudah ada TIDAK disentuh — tidak diubah namanya, tidak
 * diaktifkan ulang, tidak dipindah induknya. Jadi fungsi ini boleh dipanggil
 * saat wizard selesai DAN setiap kali sebuah modul dinyalakan, tanpa pernah
 * menimpa bagan akun yang sudah disesuaikan penggunanya.
 *
 * ══ KENAPA JUGA DIPANGGIL SAAT MODUL DINYALAKAN ════════════════════════════
 * Modul bisa dinyalakan kapan saja dari Pengaturan. Bila akunnya tidak ikut
 * lahir saat itu, pemakaian pertama modul itu akan berhenti dengan
 * `PostingRuleError` — "aturan ini butuh slot akun yang belum dikonfigurasi
 * siapa pun" — sebuah galat yang benar tapi muncul di tempat yang salah:
 * di tengah pekerjaan, bukan saat modulnya dinyalakan.
 */
import "server-only";

import { normalBalanceFor } from "@/lib/accounting";
import { coaTemplateFor } from "@/lib/coa-template";
import { seedDefaultMappings } from "@/lib/posting/mapping";
import type { BusinessModule } from "@/lib/business-modules";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export interface CoaSeedResult {
  created: number;
  existing: number;
  /** Mapping akun bawaan yang ikut terpasang (slot → akun). */
  mappingsCreated: number;
  /** Kategori aset tetap bawaan yang ikut lahir (issue #416). */
  assetCategoriesCreated: number;
}

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

export async function seedCoaForModules(
  client: Client,
  modules: Iterable<BusinessModule>
): Promise<CoaSeedResult> {
  const rows = coaTemplateFor(modules);

  const byCode = new Map<string, number>();
  let created = 0;
  let existing = 0;

  /*
   * Induk lebih dulu, anak menyusul — `parentId` hanya bisa diisi bila
   * induknya sudah punya id. Template sendiri sudah tersusun begitu, tapi
   * pengurutan ulang di sini membuatnya tidak bergantung pada urutan berkas.
   */
  const ordered = [...rows.filter((r) => !r.parent), ...rows.filter((r) => r.parent)];

  for (const row of ordered) {
    const found = await client.account.findUnique({
      where: { code: row.code },
      select: { id: true },
    });
    if (found) {
      byCode.set(row.code, found.id);
      existing++;
      continue;
    }

    const account = await client.account.create({
      data: {
        code: row.code,
        name: row.name,
        type: row.type,
        currency: row.currency ?? "IDR",
        parentId: row.parent ? (byCode.get(row.parent) ?? null) : null,
        normalBalance: normalBalanceFor(row.type),
        isActive: true,
      },
      select: { id: true },
    });
    byCode.set(row.code, account.id);
    created++;
  }

  // Slot posting menunjuk KODE akun; yang kodenya belum ada dilewati diam-diam
  // oleh penyemai mapping, jadi memanggilnya lagi setelah modul baru menyala
  // adalah cara slot-slot yang tadinya kosong akhirnya terisi.
  const mappings = await seedDefaultMappings(client);

  /* Kategori aset tetap ikut lahir di sini (issue #416) — sesudah akun dan
     mapping, sebab kategorinya MENUNJUK akun yang baru saja disemai (FK
     RESTRICT). Diam bila akunnya tidak ada: perusahaan tanpa modul Aset Tetap
     memang tidak butuh satu kategori pun. */
  const assetCategoriesCreated = await seedDefaultAssetCategories(client);

  return { created, existing, mappingsCreated: mappings.created, assetCategoriesCreated };
}
