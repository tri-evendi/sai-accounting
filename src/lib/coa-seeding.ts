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
import { coaTemplateFor, equityTemplateFor, type EquityTemplateInput } from "@/lib/coa-template";
import { ANY_CURRENCY, MAPPING_KEYS, seedDefaultMappings } from "@/lib/posting/mapping";
import { equityModelFor } from "@sai/core/legal-form";
import { seedDefaultAssetCategories } from "@/lib/asset-categories";
import type { BusinessModule } from "@/lib/business-modules";
import type { Prisma, PrismaClient } from "@sai/db/client/company";

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
  /** Baris pemilik/sekutu yang ikut lahir (bentuk usaha, 24 Okt 2026). */
  partnersCreated: number;
}


/**
 * `equity` — templat ekuitas menurut bentuk usaha (`EquityTemplateInput` di
 * `coa-template.ts`): `undefined` = ekuitas PT (perilaku lama), `null` = tanpa
 * akun ekuitas (penyalaan modul belakangan), objek = templat bentuk usahanya.
 */
export async function seedCoaForModules(
  client: Client,
  modules: Iterable<BusinessModule>,
  equity?: EquityTemplateInput | null
): Promise<CoaSeedResult> {
  const rows = coaTemplateFor(modules, equity);

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
        // Sifat beban bawaan (issue #445) — perusahaan baru langsung benar
        // tanpa mengisi apa pun. Baris non-beban tidak punya `nature`.
        expenseNature: row.nature ?? null,
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

  /* Bentuk usaha (24 Okt 2026): baris pemilik/sekutu + slot yang hanya
     berlaku bagi bentuknya. Sesudah akun, sebab barisnya MENUNJUK akun. */
  const partnersCreated = equity ? await seedEquityOwners(client, equity, byCode) : 0;

  /* Kategori aset tetap ikut lahir di sini (issue #416) — sesudah akun dan
     mapping, sebab kategorinya MENUNJUK akun yang baru saja disemai (FK
     RESTRICT). Diam bila akunnya tidak ada: perusahaan tanpa modul Aset Tetap
     memang tidak butuh satu kategori pun. */
  const assetCategoriesCreated = await seedDefaultAssetCategories(client);

  return {
    created,
    existing,
    mappingsCreated: mappings.created,
    assetCategoriesCreated,
    partnersCreated,
  };
}

/**
 * Baris `company_partners` untuk buku CV/Firma/perorangan — SEKALI.
 *
 * Hanya bila tabelnya masih KOSONG: penyemaian dipanggil berulang (wisaya
 * bolak-balik, jaring pengaman di POST akhir), dan sekutu yang sudah ada —
 * mungkin sudah diubah porsinya — tidak boleh digandakan atau ditimpa.
 * Perubahan sesudahnya lewat Pengaturan → Bentuk usaha (`lib/partners-service`).
 *
 * Usaha perorangan juga mendapat slot `retained_earnings` → Modal Pemilik:
 * slot itu tidak dipakai tutup bukunya (yang memakai baris pemilik), tetapi
 * Pemetaan Akun tidak boleh menyebutnya "belum diatur" untuk buku yang memang
 * tidak punya Laba Ditahan.
 */
async function seedEquityOwners(
  client: Client,
  equity: EquityTemplateInput,
  idByCode: Map<string, number>
): Promise<number> {
  const model = equityModelFor(equity.legalForm);
  if (model === "retained_earnings") return 0;

  if (model === "sole_owner") {
    const capitalId = idByCode.get("3101");
    if (capitalId) {
      const exists = await client.accountMapping.findUnique({
        where: { key_currency: { key: MAPPING_KEYS.RETAINED_EARNINGS, currency: ANY_CURRENCY } },
      });
      if (!exists) {
        await client.accountMapping.create({
          data: { key: MAPPING_KEYS.RETAINED_EARNINGS, currency: ANY_CURRENCY, accountId: capitalId },
        });
      }
    }
  }

  if ((await client.companyPartner.count()) > 0) return 0;
  const { partners } = equityTemplateFor(equity);
  let created = 0;
  for (const p of partners) {
    const capitalAccountId = idByCode.get(p.capitalCode);
    if (!capitalAccountId) continue;
    await client.companyPartner.create({
      data: {
        name: p.name.trim(),
        role: p.role ?? null,
        shareBp: p.shareBp,
        capitalAccountId,
        drawingAccountId: idByCode.get(p.drawingCode) ?? null,
        sortOrder: p.sortOrder,
        isActive: true,
      },
    });
    created++;
  }
  return created;
}
