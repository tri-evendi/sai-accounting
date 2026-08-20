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
import { seedDefaultAssetCategories } from "@/lib/asset-categories";
import type { BusinessModule } from "@/lib/business-modules";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

/* Diteruskan agar pemanggil yang sudah ada tidak perlu tahu ia pindah berkas;
   sumber kebenarannya tetap `lib/asset-categories.ts` (lihat kepala di sana). */
export { DEFAULT_ASSET_CATEGORIES, seedDefaultAssetCategories } from "@/lib/asset-categories";

export interface CoaSeedResult {
  created: number;
  existing: number;
  /** Mapping akun bawaan yang ikut terpasang (slot → akun). */
  mappingsCreated: number;
  /** Kategori aset tetap bawaan yang ikut lahir (issue #416). */
  assetCategoriesCreated: number;
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
