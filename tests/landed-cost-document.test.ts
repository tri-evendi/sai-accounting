/**
 * DOKUMEN BIAYA IMPOR — lapisan dokumen & jurnalnya (issue #495 butir 1).
 *
 * Mesin sebarnya sudah diuji di `landed-cost.test.ts`, dan jalur nilainya di
 * `landed-cost-costing.test.ts`. Yang diuji DI SINI adalah hal yang hanya
 * muncul begitu ia menjadi dokumen:
 *
 *  1. **Jurnalnya memindahkan yang SUDAH TERJUAL saja.** Jurnal pembelian sudah
 *     mendebet Persediaan sebesar seluruh tagihan; dokumen ini hanya
 *     mengeluarkan kembali bagian yang barangnya tidak ada lagi. Menjurnal
 *     seluruh nilainya lagi akan menggandakan biaya itu di buku besar.
 *
 *  2. **Tanpa bagian terjual, TIDAK ADA jurnal — dan itu bukan kegagalan.**
 *     Seluruh biayanya memang sudah berada di tempat yang benar.
 *
 *  3. **Rekonsiliasi buku besar ↔ laporan Nilai Persediaan tetap utuh.**
 *     Yang tersisa di Persediaan menurut buku besar harus sama persis dengan
 *     yang ditulis sebagai `cost_adjust` ke gerakan stok. Invarian itulah
 *     seluruh alasan bentuk dokumen ini, jadi ia diuji sebagai aritmetika.
 *
 *  4. **Dokumen tanpa jurnal tetap tunduk kunci periode.** `assertPeriodOpen`
 *     hidup di dalam mesin jurnal; sebuah dokumen yang tidak memposting apa pun
 *     karena itu punya SATU jalur yang bisa menulis ke bulan terkunci tanpa
 *     melewati penjaga mana pun. Dijaga dengan menyapu sumbernya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ANY_CURRENCY, MAPPING_KEYS, MAPPING_KEY_LABELS } from "@/lib/posting/mapping";
import { postForSource } from "@/lib/posting";
import { COA_TEMPLATE } from "@/lib/accounting";
import { STOCK_MOVEMENT_TYPES } from "@/lib/constants";
import { planLandedCost } from "@/lib/landed-cost";
import { PERMISSIONS } from "@/lib/authz";
import { createFakeClient, type FakeMapping } from "./fake-client";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

const DATE = new Date("2026-08-27T00:00:00Z");
const ACC = { inventory: 205, ap: 204, variance: 208 };

const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.INVENTORY, currency: ANY_CURRENCY, accountId: ACC.inventory, isActive: true },
  { key: MAPPING_KEYS.AP_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.ap, isActive: true },
  {
    key: MAPPING_KEYS.COGS_VARIANCE,
    currency: ANY_CURRENCY,
    accountId: ACC.variance,
    isActive: true,
  },
];

/** Satu dokumen beserta tagihan yang disebarnya, dalam bentuk yang dibaca engine. */
function seedDocument(opts: {
  capitalized: number;
  expensed: number;
  costCenterId?: number | null;
}) {
  return createFakeClient({
    mappings: MAPPINGS,
    landedCostDocuments: {
      1: {
        id: 1,
        number: "BIM.2026.08.00001",
        date: DATE,
        purchaseId: 31,
        basis: "value",
        amount: opts.capitalized + opts.expensed,
        capitalizedAmount: opts.capitalized,
        expensedAmount: opts.expensed,
        note: null,
        purchase: {
          id: 31,
          costCenterId: opts.costCenterId ?? null,
          supplier: { name: "Bea Cukai Tanjung Priok" },
        },
      },
    },
    supplierTransactions: {
      31: {
        id: 31,
        costCenterId: opts.costCenterId ?? null,
        supplier: { name: "Bea Cukai Tanjung Priok" },
      },
    },
  });
}

describe("jurnal dokumen biaya impor", () => {
  it("memindahkan HANYA bagian yang sudah terjual: D Selisih HPP, K Persediaan", async () => {
    const tx = seedDocument({ capitalized: 7_000_000, expensed: 3_000_000 });
    await postForSource({ sourceType: "landed_cost", sourceId: 1, tx });

    expect(tx._journals).toHaveLength(1);
    const journal = tx._journals[0];
    expect(journal.sourceType).toBe("landed_cost");

    const debit = journal.lines.find((l) => l.debit > 0)!;
    const credit = journal.lines.find((l) => l.credit > 0)!;
    expect(debit.accountId).toBe(ACC.variance);
    expect(credit.accountId).toBe(ACC.inventory);
    /* 3 juta — bukan 10 juta. Sepuluh juta sudah didebet jurnal pembeliannya. */
    expect(debit.debit).toBe(3_000_000);
    expect(credit.credit).toBe(3_000_000);
  });

  it("TIDAK menyentuh Hutang Usaha — utangnya milik tagihannya, bukan dokumen ini", async () => {
    /*
     * Daftar Utang diturunkan dari `supplier_transactions`, bukan dari jurnal.
     * Sebuah dokumen yang mengkredit 2101 sendiri akan menaikkan saldo buku
     * besar sementara daftar utangnya diam — dan selisih itu tidak akan pernah
     * bisa dijelaskan oleh satu dokumen pun.
     */
    const tx = seedDocument({ capitalized: 7_000_000, expensed: 3_000_000 });
    await postForSource({ sourceType: "landed_cost", sourceId: 1, tx });
    const akun = tx._journals[0].lines.map((l) => l.accountId);
    expect(akun).not.toContain(ACC.ap);
  });

  it("tanpa bagian terjual: TIDAK ada jurnal, dan itu jawaban yang sah", async () => {
    const tx = seedDocument({ capitalized: 10_000_000, expensed: 0 });
    const journal = await postForSource({ sourceType: "landed_cost", sourceId: 1, tx });
    expect(journal).toBeNull();
    expect(tx._journals).toHaveLength(0);
  });

  it("mewarisi pusat biaya dari pembelian yang disebarnya", async () => {
    /* Tanpa ini, biaya keluar dari cabang yang menanggungnya dan mendarat di
       "belum ditetapkan" — laba cabang itu naik tepat sebesar bagian terjual. */
    const tx = seedDocument({ capitalized: 1_000_000, expensed: 500_000, costCenterId: 5 });
    await postForSource({ sourceType: "landed_cost", sourceId: 1, tx });
    expect(tx._journals[0].costCenterId).toBe(5);
    expect(tx._journals[0].lines.every((l) => l.costCenterId === 5)).toBe(true);
  });

  it("diposting sekali: panggilan kedua tidak melahirkan jurnal kedua", async () => {
    const tx = seedDocument({ capitalized: 1_000_000, expensed: 500_000 });
    await postForSource({ sourceType: "landed_cost", sourceId: 1, tx });
    await postForSource({ sourceType: "landed_cost", sourceId: 1, tx });
    expect(tx._journals).toHaveLength(1);
  });
});

describe("invarian rekonsiliasi: buku besar ↔ nilai persediaan", () => {
  /**
   * Jurnal pembelian menaruh SELURUH tagihan di Persediaan. Dokumen ini
   * mengeluarkan bagian terjualnya. Yang tersisa di buku besar karena itu
   * = tagihan − terjual, dan itu HARUS sama dengan jumlah `value_adjustment`
   * yang ditulis ke gerakan stok — sebab laporan Nilai Persediaan diturunkan
   * dari gerakan, bukan dari buku besar.
   */
  it("sisa di buku besar = Σ penyesuaian nilai yang ditulis ke gerakan", () => {
    const total = 10_000_000;
    const plan = planLandedCost(
      [
        { itemId: 1, value: 60_000_000, quantity: 1_000, onHand: 400 },
        { itemId: 2, value: 40_000_000, quantity: 500, onHand: 500 },
      ],
      total,
      "value"
    );

    const sisaBukuBesar = total - plan.totalExpensed;
    const sumPenyesuaian = plan.lines.reduce((s, l) => s + l.capitalized, 0);
    expect(sisaBukuBesar).toBe(sumPenyesuaian);
    expect(plan.totalCapitalized).toBe(sumPenyesuaian);
  });

  it("tidak ada satu sen pun yang lahir atau menguap", () => {
    const plan = planLandedCost(
      [
        { itemId: 1, value: 1, quantity: 3, onHand: 1 },
        { itemId: 2, value: 1, quantity: 3, onHand: 2 },
        { itemId: 3, value: 1, quantity: 3, onHand: 3 },
      ],
      10,
      "value"
    );
    expect(plan.totalAllocated).toBe(10);
    expect(plan.totalCapitalized + plan.totalExpensed).toBe(10);
  });
});

describe("penjaga sumber: yang tidak bisa dibuktikan dengan aritmetika", () => {
  it("kunci periode diperiksa SENDIRI, sebab dokumen bisa tak berjurnal", () => {
    /* Cacat #4 di kepala berkas. Tanpa baris ini, dokumen yang seluruh
       barangnya masih di gudang menulis `cost_adjust` ke bulan terkunci. */
    const data = src("lib", "landed-cost-data.ts");
    expect(data).toMatch(/assertPeriodOpen\(input\.date, tx\)/);
    expect(data).toMatch(/assertPeriodOpen\(doc\.date, tx\)/);
  });

  it("baris penyesuaian berkuantitas NOL dan bernilai `valueAdjustment`", () => {
    /* Kuantitas bukan-nol akan menambah stok yang tidak pernah datang, dan
       justru MENURUNKAN rata-ratanya. */
    const data = src("lib", "landed-cost-data.ts");
    const blok = data.slice(data.indexOf("tx.stockMovement.create"));
    expect(blok).toMatch(/quantity: 0/);
    expect(blok).toMatch(/type: "cost_adjust"/);
    expect(blok).toMatch(/valueAdjustment: line\.capitalized/);
  });

  it("rencananya disusun ULANG di dalam transaksi, bukan diterima dari klien", () => {
    /* Skema POST tidak boleh punya satu pun angka uang: pratinjau di layar
       dibuat dari saldo beberapa detik sebelumnya. */
    const skema = src("lib", "validations", "landed-cost.ts");
    expect(skema).not.toMatch(/amount|capitalized|expensed|value:/);
    expect(src("lib", "landed-cost-data.ts")).toMatch(
      /const plan = await planLandedCostDocument\(input, tx\)/
    );
  });

  it("digabung per BARANG sebelum disebar — di server DAN di layar", () => {
    /*
     * Dua penerimaan barang yang sama membaca `onHand` yang sama. Menyebar per
     * BARIS menempelkan biaya dua kali ke sisa yang cuma ada satu.
     */
    expect(src("lib", "landed-cost-data.ts")).toMatch(/grouped\.set\(m\.itemId/);
    expect(
      src(
        "app",
        "(app)",
        "(dashboard)",
        "t",
        "[tenantSlug]",
        "[companySlug]",
        "landed-costs",
        "new",
        "landed-cost-form.tsx"
      )
    ).toMatch(/grouped\.set\(c\.itemId/);
  });

  it("layar memakai `planLandedCost` yang SAMA, bukan salinan rumusnya", () => {
    const form = src(
      "app",
      "(app)",
      "(dashboard)",
      "t",
      "[tenantSlug]",
      "[companySlug]",
      "landed-costs",
      "new",
      "landed-cost-form.tsx"
    );
    expect(form).toMatch(/import \{ planLandedCost/);
  });
});

describe("akun & izin yang dibutuhkan dokumen ini", () => {
  it("Selisih Harga Pokok ada di bagan akun bawaan, bertipe cogs", () => {
    const akun = COA_TEMPLATE.find((a) => a.code === "5102");
    expect(akun).toBeDefined();
    /* `cogs`, bukan `expense`: yang dicatat harga pokok barang yang BENAR-BENAR
       terjual — hanya terlambat diketahui. Di Beban Operasional ia akan membuat
       marjin kotor tampak lebih baik daripada kenyataannya. */
    expect(akun?.type).toBe("cogs");
    expect(akun?.module).toBe("inventory");
  });

  it("slot pemetaannya berdiri sendiri, terpisah dari HPP & Selisih Persediaan", () => {
    expect(MAPPING_KEYS.COGS_VARIANCE).toBe("cogs_variance");
    expect(MAPPING_KEYS.COGS_VARIANCE).not.toBe(MAPPING_KEYS.COGS);
    expect(MAPPING_KEYS.COGS_VARIANCE).not.toBe(MAPPING_KEYS.INVENTORY_ADJUSTMENT);
    expect(MAPPING_KEY_LABELS[MAPPING_KEYS.COGS_VARIANCE]).toBeTruthy();
  });

  it("`cost_adjust` adalah jenis gerakan yang sah", () => {
    expect(STOCK_MOVEMENT_TYPES).toContain("cost_adjust");
  });

  it("izinnya dideklarasikan, bukan menumpang izin modul lain", () => {
    expect(PERMISSIONS).toContain("landed_cost.read");
    expect(PERMISSIONS).toContain("landed_cost.write");
  });
});
