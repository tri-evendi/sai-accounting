/**
 * BARIS FAKTUR MENUNJUK BARANG (issue #503).
 *
 * == Kaki terakhir rantai, dan yang paling menentukan ========================
 * Surat jalan menyimpan `item_id` sejak #14, kontrak sejak #491. Faktur adalah
 * yang terakhir dijodohkan lewat NAMA — dan ia justru kaki yang menentukan,
 * sebab `remainingKg` dihitung dari yang DIFAKTURKAN, bukan dari yang dikirim.
 *
 * == Batasan yang membedakannya dari #491 ===================================
 * Baris faktur TIDAK selalu barang persediaan. "Ongkos kirim" dan "selisih
 * timbang" adalah baris faktur nyata yang tidak punya — dan tidak boleh punya —
 * baris di master barang. Karena itu `itemId` di sini nullable dan akan SERING
 * null, dan isiannya kotak teks bersaran alih-alih pemilih wajib.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildContractOutstanding,
  findOverInvoiced,
  pullInvoiceLines,
} from "@/lib/document-chain";
import { invoiceItemSchema } from "@/lib/validations/invoice";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

const KONTRAK = [
  { itemId: 6, itemName: "LONG PEPPER", bags: 10, kgPerBag: 100, pricePerKg: 50_000 },
  { itemId: 10, itemName: "LONG PEPPER", bags: 10, kgPerBag: 100, pricePerKg: 13_500 },
];

describe("skema: barang opsional, dan ketiadaannya BUKAN galat", () => {
  it("menerima baris tertaut", () => {
    const r = invoiceItemSchema.safeParse({
      itemId: 6,
      itemName: "LONG PEPPER",
      quantity: 400,
      price: 50_000,
    });
    expect(r.success).toBe(true);
  });

  it("menerima baris TEKS BEBAS — ongkos kirim bukan barang persediaan", () => {
    const r = invoiceItemSchema.safeParse({
      itemName: "Ongkos kirim",
      quantity: 1,
      price: 2_500_000,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.itemId ?? null).toBeNull();
  });

  it("nama tetap WAJIB — itulah yang tercetak di faktur", () => {
    expect(invoiceItemSchema.safeParse({ itemId: 6, itemName: "", quantity: 1, price: 1 }).success).toBe(
      false
    );
  });
});

describe("faktur tertaut membebani pagu barangnya sendiri", () => {
  it("dua barang bernama sama tidak lagi berbagi satu pagu", () => {
    const out = buildContractOutstanding({
      lines: KONTRAK,
      invoiced: [{ itemId: 6, itemName: "LONG PEPPER", quantity: 1000, price: 50_000 }],
    });
    expect(out.lines.find((l) => l.key === "#6")!.remainingKg).toBe(0);
    expect(out.lines.find((l) => l.key === "#10")!.remainingKg).toBe(1000);
  });

  it("pagarnya ikut menahan baris yang benar", () => {
    const out = buildContractOutstanding({
      lines: KONTRAK,
      invoiced: [{ itemId: 6, itemName: "LONG PEPPER", quantity: 900, price: 50_000 }],
    });
    /* Sisa barang 6 tinggal 100 kg; meminta 300 harus tertahan, sementara
       barang 10 yang masih penuh tidak boleh ikut tertahan. */
    const over = findOverInvoiced(out.lines, [
      { itemId: 6, itemName: "LONG PEPPER", quantity: 300 },
      { itemId: 10, itemName: "LONG PEPPER", quantity: 300 },
    ]);
    expect(over).toHaveLength(1);
    expect(over[0].remainingKg).toBe(100);
  });
});

describe("baris teks bebas tidak pernah dibebani pagu kontrak", () => {
  it("ongkos kirim lewat tanpa tertahan, dan terlihat sebagai tak berjodoh", () => {
    const out = buildContractOutstanding({
      lines: KONTRAK,
      invoiced: [{ itemName: "Ongkos kirim", quantity: 1, price: 2_500_000 }],
    });
    /* Tidak membebani baris mana pun... */
    expect(out.lines.every((l) => l.invoicedKg === 0)).toBe(true);
    /* ...tetapi tidak hilang begitu saja: ia dilaporkan. */
    expect(out.totals.unmatchedInvoicedValue).toBe(2_500_000);
  });

  it("dan pagarnya membiarkannya lewat", () => {
    const out = buildContractOutstanding({ lines: KONTRAK });
    const over = findOverInvoiced(out.lines, [
      { itemName: "Ongkos kirim", quantity: 1 },
      { itemName: "Selisih timbang", quantity: 5 },
    ]);
    expect(over).toEqual([]);
  });
});

describe("\"Ambil dari Kontrak\" mewarisi tautannya", () => {
  /*
   * Bagian yang paling berharga dari issue ini: pengguna yang menekan "Ambil"
   * mendapat baris yang SUDAH tertaut tanpa memilih apa pun — termasuk pada
   * kontrak yang memuat dua barang bernama sama, yang justru kasus tersulitnya.
   */
  it("baris tarikan membawa itemId baris kontraknya", () => {
    const out = buildContractOutstanding({ lines: KONTRAK });
    const pulled = pullInvoiceLines(out.lines, "contract");
    expect(pulled).toHaveLength(2);
    expect(pulled.map((l) => l.itemId)).toEqual([6, 10]);
    expect(new Set(pulled.map((l) => l.itemName)).size).toBe(1);
  });

  it("baris kontrak yang belum tertaut menghasilkan tarikan ber-itemId null", () => {
    const out = buildContractOutstanding({
      lines: [{ itemName: "CLOVE", bags: 10, kgPerBag: 100, pricePerKg: 85_000 }],
    });
    expect(pullInvoiceLines(out.lines)[0].itemId).toBeNull();
  });
});

describe("dokumen lama tetap terhitung", () => {
  it("kontrak tertaut + faktur lama yang cuma bernama tetap berjodoh", () => {
    /* Penjaga yang sama dengan PR #502 — di sini untuk kaki faktur. */
    const out = buildContractOutstanding({
      lines: [{ itemId: 6, itemName: "CLOVE", bags: 10, kgPerBag: 100, pricePerKg: 85_000 }],
      invoiced: [{ itemName: "clove", quantity: 400, price: 85_000 }],
    });
    expect(out.lines[0].invoicedKg).toBe(400);
    expect(out.lines[0].remainingKg).toBe(600);
  });
});

describe("isiannya kotak teks, bukan pemilih wajib", () => {
  it("formulir faktur memakai ItemNameInput", () => {
    const form = src(
      "app",
      "(app)",
      "(dashboard)",
      "t",
      "[tenantSlug]",
      "[companySlug]",
      "invoices",
      "new",
      "invoice-form.tsx"
    );
    expect(form).toMatch(/<ItemNameInput/);
    /* Pemilih WAJIB akan mematahkan ongkos kirim — lihat kepala berkas. */
    expect(form).not.toMatch(/<SelectField[^>]*itemName/);
  });

  it("layar SUNTING memakainya juga — kalau tidak, menyunting memutus tautan", () => {
    const form = src(
      "app",
      "(app)",
      "(dashboard)",
      "t",
      "[tenantSlug]",
      "[companySlug]",
      "invoices",
      "[id]",
      "edit",
      "invoice-edit-form.tsx"
    );
    expect(form).toMatch(/<ItemNameInput/);
    expect(form).toMatch(/itemId: item\.itemId \?\? null/);
  });

  it("mengetik nama yang BERBEDA mencabut tautannya", () => {
    const ctrl = src("components", "ui", "item-name-input.tsx");
    /* Tautan yang bertahan atas nama yang sudah berubah adalah cara paling
       halus untuk mengurangi pagu kontrak atas barang yang tak difakturkan. */
    expect(ctrl).toMatch(/itemId: text === linkedName \? itemId : null/);
  });
});

describe("migrasi 0053 tidak menebak", () => {
  it("hanya menautkan nama yang cocok ke TEPAT SATU barang", () => {
    const sql = readFileSync(
      join(__dirname, "..", "prisma", "migrations", "0053_invoice_item_link", "migration.sql"),
      "utf8"
    );
    expect(sql).toMatch(/COUNT\(\*\)[\s\S]*?\)\s*=\s*1/);
    expect(sql).toMatch(/LOWER\(TRIM\(REGEXP_REPLACE/);
    expect(sql).toMatch(/ON DELETE RESTRICT/);
  });
});
