/**
 * Perusahaan baru tidak boleh terkunci di wisayanya sendiri (issue #416).
 *
 * ══ KEADAAN YANG DIJAGA BERKAS INI ══════════════════════════════════════════
 * Dilaporkan dari produksi 20 Agustus 2026: dua perusahaan yang baru disediakan
 * (`sai_t6_…`, `sai_t7_…`) sama-sama berisi NOL akun kas/bank, nol pelanggan,
 * nol pemasok, nol barang, dan nol kategori aset — sementara wisaya menuntut
 * minimal satu saldo awal untuk bisa disimpan. Bagian-bagian di langkah Saldo
 * Awal menyembunyikan tombol "Tambah"-nya saat daftarnya kosong, jadi layarnya
 * tidak punya satu isian pun; dan gerbang setup memantulkan setiap halaman lain
 * kembali ke wisaya, sehingga tidak ada tempat lain untuk membuat data itu.
 * Orangnya mendaftar dua kali, mengira dirinya yang salah.
 *
 * Tiga pagar di bawah ini masing-masing menutup satu ruas rantai itu. Semuanya
 * berjalan tanpa basis data: yang diuji adalah ATURANNYA, bukan Prisma.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ASSET_CATEGORIES,
  seedDefaultAssetCategories,
} from "@/lib/coa-seeding";
import { FIXED_ASSET_COLUMNS } from "@/lib/import/fixed-assets";
import { setupSchema } from "@/lib/validations/setup";
import { assertCanRunSetup, OpeningBalanceError } from "@/lib/opening-balance";

/**
 * Klien in-memory sekadar-cukup: hanya `account.findMany` dan
 * `fixedAssetCategory.{findMany,create}` yang disentuh penyemai kategori.
 */
function fakeClient(accountCodes: string[], categories: string[] = []) {
  const accounts = accountCodes.map((code, i) => ({ id: i + 1, code }));
  const rows = categories.map((name, i) => ({ id: i + 1, name }));
  const created: Record<string, unknown>[] = [];

  return {
    created,
    rows,
    client: {
      account: {
        findMany: async ({ where }: { where: { code: { in: string[] } } }) =>
          accounts.filter((a) => where.code.in.includes(a.code)),
      },
      fixedAssetCategory: {
        findMany: async () => rows.map((r) => ({ name: r.name })),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          rows.push({ id: rows.length + 1, name: data.name as string });
          return data;
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

/** Ketiga akun yang ditunjuk kategori bawaan (slot mapping aset tetap). */
const ASSET_ACCOUNTS = ["120101", "120102", "610103"];

describe("kategori aset tetap bawaan — templat tidak boleh menolak contohnya sendiri", () => {
  /*
   * Pagar TERPENTING di berkas ini, dan yang paling murah.
   *
   * Templat impor aset tetap mencontohkan sebuah nama kategori di kolom
   * "Kategori" — dan pada perusahaan baru, nama itulah yang diketik orang.
   * Kalau contoh yang dibagikan aplikasi bukan kategori yang aplikasi itu
   * sendiri sediakan, setiap berkas yang mengikuti templat akan ditolak baris
   * demi baris. Persis yang terjadi dengan "Kendaraan".
   */
  it("contoh kolom Kategori di templat adalah salah satu kategori bawaan", () => {
    const example = FIXED_ASSET_COLUMNS.find((c) => c.key === "category")?.example;
    expect(example).toBeTruthy();

    const known = DEFAULT_ASSET_CATEGORIES.map((c) => c.name.toLowerCase());
    expect(known).toContain(String(example).trim().toLowerCase());
  });

  it("setiap kategori bawaan punya umur manfaat yang bisa disusutkan (bukan nol)", () => {
    for (const category of DEFAULT_ASSET_CATEGORIES) {
      expect(category.defaultUsefulLifeMonths).toBeGreaterThan(0);
    }
  });

  it("menyemai seluruh kategori bawaan ketika akun aset tetapnya ada", async () => {
    const { client, created } = fakeClient(ASSET_ACCOUNTS);

    const count = await seedDefaultAssetCategories(client);

    expect(count).toBe(DEFAULT_ASSET_CATEGORIES.length);
    expect(created.map((c) => c.name)).toEqual(DEFAULT_ASSET_CATEGORIES.map((c) => c.name));
    // Ketiga akunnya terpasang — kategori tanpa akun akan ditolak FK RESTRICT.
    for (const row of created) {
      expect(row.assetAccountId).toBeTruthy();
      expect(row.accumulatedAccountId).toBeTruthy();
      expect(row.expenseAccountId).toBeTruthy();
    }
  });

  it("idempoten: pemanggilan kedua tidak membuat apa pun", async () => {
    const { client } = fakeClient(ASSET_ACCOUNTS);

    await seedDefaultAssetCategories(client);
    expect(await seedDefaultAssetCategories(client)).toBe(0);
  });

  it("tidak menggandakan kategori yang hanya beda huruf besar/kecil", async () => {
    // Pencocokan impor `toLowerCase()`, jadi dua baris seperti ini akan membuat
    // impor memilih salah satu tanpa bisa dijelaskan kepada siapa pun.
    const { client, created } = fakeClient(ASSET_ACCOUNTS, ["kendaraan"]);

    await seedDefaultAssetCategories(client);

    expect(created.map((c) => String(c.name).toLowerCase())).not.toContain("kendaraan");
  });

  it("diam ketika akunnya tidak ada — perusahaan tanpa modul Aset Tetap", async () => {
    const { client, created } = fakeClient(["1101"]);

    expect(await seedDefaultAssetCategories(client)).toBe(0);
    expect(created).toHaveLength(0);
  });
});

const COMPANY = {
  name: "PT Contoh",
  baseCurrency: "IDR",
  fiscalYearStart: "2026-01-01",
} as const;

describe("wisaya selalu bisa diselesaikan — jalan keluar 'mulai tanpa saldo awal'", () => {
  it("payload kosong TETAP ditolak bila tidak ada yang mengakuinya", () => {
    const parsed = setupSchema.safeParse({ company: COMPANY });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(JSON.stringify(parsed.error.issues)).toContain("atLeastOneOpeningBalance");
    }
  });

  it("payload kosong diterima ketika benderanya dinyalakan", () => {
    const parsed = setupSchema.safeParse({ company: COMPANY, noOpeningBalances: true });

    expect(parsed.success).toBe(true);
  });

  it("benderanya TIDAK mematikan aturan lain — barang kembar tetap ditolak", () => {
    const row = { itemId: 1, quantity: 2, unitCost: 1000 };
    const parsed = setupSchema.safeParse({
      company: COMPANY,
      noOpeningBalances: true,
      inventory: [row, row],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(JSON.stringify(parsed.error.issues)).toContain("openingStockDuplicateItem");
    }
  });

  it("penjaga sekali-jalan tidak melemah tanpa jurnal pembuka", () => {
    // Buku yang dimulai dari nol tidak punya jurnal pembuka untuk dijadikan
    // bukti, jadi bendera `is_setup`-lah yang menahan jalan kedua — sendirian.
    expect(() => assertCanRunSetup({ isSetup: true, liveOpeningJournals: 0 })).toThrow(
      OpeningBalanceError
    );
  });
});
