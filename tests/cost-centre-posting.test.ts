/**
 * Mesin posting menstempel dimensi pusat biaya (issue #91).
 *
 * Janji yang diuji di sini: pusat biaya dokumen sumber sampai ke SETIAP baris
 * jurnal yang dihasilkannya — dan itu dikerjakan di SATU tempat, bukan tersebar
 * di empat belas `buildXEntry`. Karena itu tesnya menyapu banyak jenis sumber
 * sekaligus: kalau stempelnya pindah ke masing-masing pembangun, satu di antara
 * mereka akan lupa, dan berkas inilah yang memberitahu.
 *
 * Dua sisi yang sama pentingnya:
 *   • dokumen BERTAG  → setiap baris membawa pusat biayanya (termasuk saat
 *     dokumen diposting ulang, dibalik, atau dipindah ke cabang lain);
 *   • dokumen TANPA tag → setiap baris `null`. Itu keadaan SELURUH data lama,
 *     jadi ini yang membuktikan tak ada satu jurnal pun berubah perilakunya.
 */
import { describe, expect, it } from "vitest";
import {
  ANY_CURRENCY,
  MAPPING_KEYS,
  postForSource,
  repostForSource,
} from "@/lib/posting";
import { postJournal } from "@/lib/ledger";
import { createFakeClient, type FakeJournal, type FakeMapping } from "./fake-client";

const DATE = new Date("2026-03-15T00:00:00Z");

/** Pusat biaya: 5 = Cabang Jakarta, 6 = Cabang Surabaya. */
const JAKARTA = 5;
const SURABAYA = 6;

const ACC = {
  ar: 101,
  sales: 201,
  vatOut: 202,
  vatIn: 203,
  ap: 204,
  inventory: 205,
  cogs: 206,
  cash: 301,
  counter: 999,
};

const MAPPINGS: FakeMapping[] = [
  { key: MAPPING_KEYS.AR_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.ar, isActive: true },
  { key: MAPPING_KEYS.SALES_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.sales, isActive: true },
  { key: MAPPING_KEYS.VAT_OUT, currency: ANY_CURRENCY, accountId: ACC.vatOut, isActive: true },
  { key: MAPPING_KEYS.VAT_IN, currency: ANY_CURRENCY, accountId: ACC.vatIn, isActive: true },
  { key: MAPPING_KEYS.AP_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.ap, isActive: true },
  { key: MAPPING_KEYS.INVENTORY, currency: ANY_CURRENCY, accountId: ACC.inventory, isActive: true },
  { key: MAPPING_KEYS.COGS, currency: ANY_CURRENCY, accountId: ACC.cogs, isActive: true },
  { key: MAPPING_KEYS.CASH_DEFAULT, currency: ANY_CURRENCY, accountId: ACC.cash, isActive: true },
  { key: MAPPING_KEYS.CASH_BANK, currency: ANY_CURRENCY, accountId: ACC.cash, isActive: true },
];

/**
 * `postForSource` bertipe `Journal` Prisma (kepala saja); yang dikembalikan
 * klien palsu adalah `FakeJournal` lengkap dengan barisnya. Cast yang sama
 * dipakai `tests/posting-engine.test.ts`.
 */
const posted = (j: unknown) => j as unknown as FakeJournal;

/** Setiap pusat biaya yang muncul pada baris-baris sebuah jurnal, tanpa duplikat. */
const centresOf = (j: FakeJournal) => [...new Set(j.lines.map((l) => l.costCenterId))];

// ─── Dokumen sumber fase 1 ───────────────────────────────

describe("dokumen sumber menstempel pusat biayanya ke setiap baris", () => {
  it("faktur penjualan — termasuk baris PPN, bukan hanya piutang & penjualan", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        7: {
          id: 7,
          invoiceNo: "SI.2026.03.00007",
          date: DATE,
          status: "pending",
          taxAmount: 1_100_000,
          costCenterId: JAKARTA,
          items: [{ quantity: 10, price: 1_000_000 }],
        },
      },
    });

    const journal = posted(await postForSource({ sourceType: "invoice", sourceId: 7, tx }));
    expect(journal.lines.length).toBe(3); // piutang, penjualan, PPN keluaran
    expect(centresOf(journal)).toEqual([JAKARTA]);
    expect(journal.costCenterId).toBe(JAKARTA);
  });

  it("pembelian dari pemasok", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      supplierTransactions: {
        31: {
          id: 31,
          date: DATE,
          type: "purchase",
          amount: 10_000_000,
          taxAmount: 1_100_000,
          currency: "IDR",
          costCenterId: SURABAYA,
          supplier: { name: "PT Sumber Tani" },
        },
      },
    });

    const journal = posted(await postForSource({ sourceType: "supplier_transaction", sourceId: 31, tx }));
    expect(journal.lines.length).toBe(3);
    expect(centresOf(journal)).toEqual([SURABAYA]);
  });

  it("transaksi kas", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      cashAccounts: {
        41: {
          id: 41,
          type: "bank",
          date: DATE,
          description: "Sewa kantor cabang",
          currency: "IDR",
          debit: 0,
          credit: 5_000_000,
          costCenterId: SURABAYA,
        },
      },
    });

    const journal = posted(await postForSource({
      sourceType: "cash_account",
      sourceId: 41,
      counterAccountId: ACC.counter,
      tx,
    }));
    expect(centresOf(journal)).toEqual([SURABAYA]);
  });
});

// ─── Dokumen turunan mewarisi dari asalnya ───────────────

describe("dokumen turunan mewarisi pusat biaya dokumen asalnya", () => {
  it("penerimaan faktur → pusat biaya fakturnya", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoicePayments: {
        11: {
          id: 11,
          date: DATE,
          amount: 4_000_000,
          currency: "IDR",
          invoice: { id: 7, invoiceNo: "SI.2026.03.00007", currency: "IDR", rate: null, costCenterId: JAKARTA },
        },
      },
    });

    const journal = posted(await postForSource({ sourceType: "invoice_payment", sourceId: 11, tx }));
    expect(centresOf(journal)).toEqual([JAKARTA]);
  });

  it("retur penjualan → pusat biaya faktur asalnya (kalau tidak, laba cabang jadi lebih besar dari seharusnya)", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      salesReturns: {
        1: {
          id: 1,
          returnNo: "RSJ.2026.03.00001",
          date: DATE,
          status: "posted",
          currency: "IDR",
          subtotal: 2_000_000,
          taxAmount: 220_000,
          invoice: { costCenterId: JAKARTA },
        },
      },
    });

    const journal = posted(await postForSource({ sourceType: "sales_return", sourceId: 1, tx }));
    expect(centresOf(journal)).toEqual([JAKARTA]);
  });

  it("retur pembelian → pusat biaya pembelian asalnya", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      purchaseReturns: {
        1: {
          id: 1,
          returnNo: "RPB.2026.03.00001",
          date: DATE,
          status: "posted",
          currency: "IDR",
          subtotal: 1_000_000,
          taxAmount: 0,
          purchase: { costCenterId: SURABAYA },
        },
      },
    });

    const journal = posted(await postForSource({ sourceType: "purchase_return", sourceId: 1, tx }));
    expect(centresOf(journal)).toEqual([SURABAYA]);
  });
});

// ─── Perilaku lama tak berubah ───────────────────────────

describe("dokumen tanpa pusat biaya tetap seperti sebelum issue #91", () => {
  it("faktur tanpa tag → setiap baris null (keadaan SELURUH data lama)", async () => {
    const tx = createFakeClient({
      mappings: MAPPINGS,
      invoices: {
        8: {
          id: 8,
          invoiceNo: "SI.2026.03.00008",
          date: DATE,
          status: "pending",
          items: [{ quantity: 1, price: 500_000 }],
        },
      },
    });

    const journal = posted(await postForSource({ sourceType: "invoice", sourceId: 8, tx }));
    expect(centresOf(journal)).toEqual([null]);
    expect(journal.costCenterId).toBeNull();
  });

  it("HPP dari gerakan stok belum berdimensi di fase 1 — dan itu keputusan, bukan kelalaian", async () => {
    // Persediaan belum punya dimensi, jadi HPP-nya belum bisa dipilah. Tes ini
    // MENGUNCI kenyataan itu supaya perubahannya nanti disengaja: begitu stok
    // berdimensi, tes ini yang harus diperbarui lebih dulu.
    const tx = createFakeClient({
      mappings: MAPPINGS,
      stockMovementsById: {
        51: { id: 51, itemId: 9, date: DATE, type: "out", quantity: 2, item: { name: "Kopi Arabika" } },
      },
      stockMovements: [
        { itemId: 9, type: "in", quantity: 10, unitCost: 100_000, date: new Date("2026-01-01T00:00:00Z") },
      ],
    });

    const journal = posted(await postForSource({ sourceType: "stock_movement", sourceId: 51, tx }));
    expect(centresOf(journal)).toEqual([null]);
  });
});

// ─── Posting ulang & pembalikan ──────────────────────────

describe("posting ulang & pembalikan membawa dimensinya ikut", () => {
  it("pembalikan membawa pusat biaya yang sama — cabang yang dibebani ikut dibebaskan", async () => {
    const invoice: Record<string, unknown> = {
      id: 7,
      invoiceNo: "SI.2026.03.00007",
      date: DATE,
      status: "pending",
      costCenterId: JAKARTA,
      items: [{ quantity: 1, price: 1_000_000 }],
    };
    const tx = createFakeClient({ mappings: MAPPINGS, invoices: { 7: invoice } });

    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    await repostForSource({ sourceType: "invoice", sourceId: 7, tx });

    const reversal = tx._journals.find((j) => j.type === "reversal")!;
    expect(centresOf(reversal)).toEqual([JAKARTA]);
  });

  it("dokumen yang dipindah ke cabang lain: jurnal baru ikut pindah, pembalikannya tetap di cabang lama", async () => {
    const invoice: Record<string, unknown> = {
      id: 7,
      invoiceNo: "SI.2026.03.00007",
      date: DATE,
      status: "pending",
      costCenterId: JAKARTA,
      items: [{ quantity: 1, price: 1_000_000 }],
    };
    const tx = createFakeClient({ mappings: MAPPINGS, invoices: { 7: invoice } });

    await postForSource({ sourceType: "invoice", sourceId: 7, tx });
    invoice.costCenterId = SURABAYA; // pengguna memindahkan fakturnya
    const reposted = posted(await repostForSource({ sourceType: "invoice", sourceId: 7, tx }));

    const reversal = tx._journals.find((j) => j.type === "reversal")!;
    // Pembalikan menghapus beban dari cabang yang MEMANG dibebani sebelumnya…
    expect(centresOf(reversal)).toEqual([JAKARTA]);
    // …dan jurnal barunya berdiri di cabang yang baru. Bersama-sama: Jakarta
    // netto nol, Surabaya menanggung penuh. Kalau stempelnya di-cache alih-alih
    // dibaca ulang, keduanya akan sama dan Jakarta tetap terbebani selamanya.
    expect(centresOf(reposted)).toEqual([SURABAYA]);
  });
});

// ─── Jurnal manual: penimpaan per baris ──────────────────

describe("jurnal manual: pusat biaya boleh ditimpa per baris", () => {
  it("baris tanpa pilihan mengikuti kepala; baris yang memilih menang", async () => {
    const tx = createFakeClient({ mappings: MAPPINGS });

    // Tagihan listrik bersama: dibayar dari kas kantor pusat (mengikuti kepala,
    // yang di sini sengaja kosong), bebannya dibagi ke dua cabang.
    const journal = await postJournal(
      {
        date: DATE,
        note: "Tagihan listrik bersama",
        lines: [
          { accountId: ACC.counter, debit: 1_800_000, costCenterId: JAKARTA },
          { accountId: ACC.counter, debit: 1_200_000, costCenterId: SURABAYA },
          { accountId: ACC.cash, credit: 3_000_000 },
        ],
      },
      tx
    );

    expect(journal.lines.map((l) => l.costCenterId)).toEqual([JAKARTA, SURABAYA, null]);
  });

  it("pusat biaya di kepala jadi nilai bawaan untuk baris yang tak memilih", async () => {
    const tx = createFakeClient({ mappings: MAPPINGS });

    const journal = await postJournal(
      {
        date: DATE,
        note: "Reklasifikasi cabang",
        costCenterId: JAKARTA,
        lines: [
          { accountId: ACC.counter, debit: 500_000 },
          { accountId: ACC.cash, credit: 500_000, costCenterId: SURABAYA },
        ],
      },
      tx
    );

    expect(journal.lines.map((l) => l.costCenterId)).toEqual([JAKARTA, SURABAYA]);
    expect(journal.costCenterId).toBe(JAKARTA);
  });
});
