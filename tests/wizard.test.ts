/**
 * Wizard terpandu "Penjualan/Pembelian Baru" (issue #5) — keputusan murninya.
 *
 * Yang diuji di sini adalah tiga hal yang menentukan apakah wizard itu benar,
 * dan ketiganya bisa salah tanpa satu pun query database:
 *
 *  1. **Urutan & gerbang langkah.** Melompat maju harus mustahil, mundur harus
 *     bebas, dan setiap langkah harus menahan isian yang belum sah — kalau tidak,
 *     penjaga server yang menolak di detik terakhir dan pengguna kehilangan
 *     seluruh isiannya.
 *  2. **Serialisasi draf.** Draf adalah SATU-SATUNYA tempat pekerjaan hidup
 *     sebelum "Selesai". Kalau ia bangkit basi (harga tiga hari lalu) atau gagal
 *     dibaca diam-diam, keduanya merusak: yang pertama menyimpan angka salah,
 *     yang kedua menghapus pekerjaan tanpa penjelasan.
 *  3. **Sumbangan setiap langkah ke muatan akhir.** Langkah 2 memberi barang &
 *     harga, langkah 3 memberi surat jalan (atau tidak sama sekali), langkah 4
 *     memberi identitas & jumlah tagihan. Yang tidak dicentang tidak boleh
 *     menyelinap masuk.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { QUICK_ACTIONS } from "@/lib/quick-actions";
import {
  DRAFT_TTL_MS,
  DRAFT_VERSION,
  PURCHASE_STEPS,
  SALES_STEPS,
  applySalesPull,
  buildPurchasePayload,
  buildSalesPayload,
  canJumpToStep,
  draftRejectionMessage,
  draftStorageKey,
  emptyPurchaseDraft,
  emptySalesDraft,
  firstBlockedPurchaseStep,
  firstBlockedSalesStep,
  nextStepId,
  parseDraft,
  prevStepId,
  purchaseNote,
  purchaseTotal,
  purchaseValue,
  salesDraftOutstanding,
  salesInvoiceSubtotal,
  salesInvoiceTax,
  salesInvoiceTotal,
  salesOrderValue,
  serializeDraft,
  shipKg,
  stepIndex,
  validatePurchaseStep,
  validateSalesStep,
  type PurchaseDraft,
  type SalesDraft,
  type WizardStepMeta,
} from "@/lib/wizard";

const TODAY = "2026-07-20";

/** Draf penjualan yang sudah lengkap — titik awal setiap uji "apa yang rusak". */
function completeSalesDraft(): SalesDraft {
  const draft = emptySalesDraft(TODAY);
  return {
    ...draft,
    customer: { ...draft.customer, mode: "existing", id: 7 },
    lines: [
      {
        itemId: 3,
        itemName: "Kopi Arabika",
        quantity: 1000,
        price: 50_000,
        unit: "kg",
        ship: true,
        shipBags: 20,
        shipKgPerBag: 50,
        billQuantity: 1000,
      },
    ],
    delivery: { ...draft.delivery, include: true, date: TODAY },
    invoice: { ...draft.invoice, invoiceNo: "INV-001", date: TODAY },
  };
}

function completePurchaseDraft(): PurchaseDraft {
  const draft = emptyPurchaseDraft(TODAY);
  return {
    ...draft,
    supplier: { ...draft.supplier, mode: "existing", id: 4 },
    lines: [
      {
        itemId: 3,
        itemName: "Kopi Arabika",
        quantity: 500,
        price: 40_000,
        unit: "kg",
        receive: true,
        receiveQuantity: 500,
      },
    ],
    receipt: { include: true, date: TODAY },
    purchase: { ...draft.purchase, date: TODAY },
  };
}

/* ─────────────────────── 1. Urutan & gerbang langkah ─────────────────────── */

/** Id langkah yang boleh dilewati — dibaca lewat tipe lebar, bukan literalnya. */
const optionalIds = (steps: readonly WizardStepMeta[]) =>
  steps.filter((s) => s.optional).map((s) => s.id);

describe("urutan langkah", () => {
  it("penjualan memakai lima langkah issue #5, dengan surat jalan opsional", () => {
    expect(SALES_STEPS.map((s) => s.id)).toEqual([
      "pelanggan",
      "barang",
      "pengiriman",
      "faktur",
      "ringkasan",
    ]);
    // Hanya surat jalan yang boleh dilewati; sisanya wajib.
    expect(optionalIds(SALES_STEPS)).toEqual(["pengiriman"]);
  });

  it("pembelian mencerminkan sisi pemasok, dengan barang masuk opsional", () => {
    expect(PURCHASE_STEPS.map((s) => s.id)).toEqual([
      "pemasok",
      "barang",
      "penerimaan",
      "pembelian",
      "ringkasan",
    ]);
    expect(optionalIds(PURCHASE_STEPS)).toEqual(["penerimaan"]);
  });

  it("setiap langkah punya judul dan penjelasan satu kalimat", () => {
    for (const step of [...SALES_STEPS, ...PURCHASE_STEPS]) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(15);
    }
  });

  it("maju & mundur berhenti di ujungnya, tidak melingkar", () => {
    expect(nextStepId(SALES_STEPS, "pelanggan")).toBe("barang");
    expect(nextStepId(SALES_STEPS, "ringkasan")).toBeNull();
    expect(prevStepId(SALES_STEPS, "barang")).toBe("pelanggan");
    expect(prevStepId(SALES_STEPS, "pelanggan")).toBeNull();
    expect(stepIndex(SALES_STEPS, "tidak-ada")).toBe(-1);
  });

  it("penanda langkah hanya bisa dipakai MUNDUR — melompat maju akan melewati penjaga", () => {
    expect(canJumpToStep(SALES_STEPS, "pelanggan", "faktur")).toBe(true);
    expect(canJumpToStep(SALES_STEPS, "faktur", "faktur")).toBe(true);
    expect(canJumpToStep(SALES_STEPS, "ringkasan", "barang")).toBe(false);
    expect(canJumpToStep(SALES_STEPS, "tidak-ada", "barang")).toBe(false);
  });
});

describe("penjaga langkah penjualan", () => {
  it("draf lengkap tidak menahan langkah mana pun", () => {
    const draft = completeSalesDraft();
    const ctx = { stockByItem: new Map([[3, 5000]]) };
    for (const step of SALES_STEPS) {
      expect(validateSalesStep(draft, step.id, ctx)).toEqual([]);
    }
    expect(firstBlockedSalesStep(draft, ctx)).toBeNull();
  });

  it("langkah 1 menahan pelanggan yang belum dipilih maupun yang tanpa nama", () => {
    const draft = emptySalesDraft(TODAY);
    expect(validateSalesStep(draft, "pelanggan")).toHaveLength(1);

    const baru = { ...draft, customer: { ...draft.customer, mode: "new" as const } };
    expect(validateSalesStep(baru, "pelanggan")[0]).toMatch(/Nama pelanggan wajib diisi/);

    const emailSalah = {
      ...baru,
      customer: { ...baru.customer, name: "PT Baru", email: "bukan-email" },
    };
    expect(validateSalesStep(emailSalah, "pelanggan").join(" ")).toMatch(/email/i);
  });

  it("langkah 2 menahan baris tanpa jumlah, dan yang melebihi sisa kontrak", () => {
    const draft = completeSalesDraft();
    const nol = { ...draft, lines: [{ ...draft.lines[0], quantity: 0 }] };
    expect(validateSalesStep(nol, "barang").join(" ")).toMatch(/lebih besar dari 0/);

    const ctx = { contractRemainingKg: new Map([["kopi arabika", 400]]) };
    expect(validateSalesStep(draft, "barang", ctx).join(" ")).toMatch(/melebihi sisa kontrak/);
    // Sisa yang cukup tidak menahan apa pun.
    expect(
      validateSalesStep(draft, "barang", { contractRemainingKg: new Map([["kopi arabika", 1000]]) })
    ).toEqual([]);
  });

  it("langkah 3 yang DILEWATI tidak menahan apa pun, bahkan dengan stok kosong", () => {
    const draft = { ...completeSalesDraft(), delivery: { ...completeSalesDraft().delivery, include: false } };
    expect(validateSalesStep(draft, "pengiriman", { stockByItem: new Map() })).toEqual([]);
  });

  it("langkah 3 mencerminkan assertStockAvailable sebelum apa pun dikirim", () => {
    const draft = completeSalesDraft();
    const kurang = validateSalesStep(draft, "pengiriman", { stockByItem: new Map([[3, 300]]) });
    expect(kurang.join(" ")).toMatch(/Stok tidak cukup/);
    // Penjaga yang sama ikut di ringkasan — mundur lalu melompat maju tidak lolos.
    expect(
      validateSalesStep(draft, "ringkasan", { stockByItem: new Map([[3, 300]]) }).join(" ")
    ).toMatch(/Stok tidak cukup/);
  });

  it("langkah 3 menolak barang yang tidak ada di master stok", () => {
    const base = completeSalesDraft();
    const bebas = {
      ...base,
      lines: [{ ...base.lines[0], itemId: null }],
    };
    expect(validateSalesStep(bebas, "pengiriman").join(" ")).toMatch(/tidak ada di daftar stok/);
  });

  it("langkah 3 menolak kiriman yang melebihi yang dipesan", () => {
    const base = completeSalesDraft();
    const kelebihan = { ...base, lines: [{ ...base.lines[0], shipKgPerBag: 100 }] };
    expect(validateSalesStep(kelebihan, "pengiriman").join(" ")).toMatch(/melebihi yang dipesan/);
  });

  it("langkah 3 mencerminkan kunci periode (#13)", () => {
    const draft = completeSalesDraft();
    const issues = validateSalesStep(draft, "pengiriman", {
      closedPeriods: [{ year: 2026, month: 7 }],
    });
    expect(issues.join(" ")).toMatch(/sudah ditutup/);
  });

  it("langkah 4 menahan nomor/tanggal kosong, kurs valas, dan tagihan nol", () => {
    const draft = completeSalesDraft();

    const tanpaNomor = { ...draft, invoice: { ...draft.invoice, invoiceNo: "" } };
    expect(validateSalesStep(tanpaNomor, "faktur").join(" ")).toMatch(/Nomor tagihan wajib/);

    const valas = { ...draft, invoice: { ...draft.invoice, currency: "USD", rate: 0 } };
    expect(validateSalesStep(valas, "faktur").join(" ")).toMatch(/Kurs ke IDR wajib diisi/);

    const berkurs = { ...draft, invoice: { ...draft.invoice, currency: "USD", rate: 16_250 } };
    expect(validateSalesStep(berkurs, "faktur")).toEqual([]);

    const belumDitagih = { ...draft, lines: [{ ...draft.lines[0], billQuantity: 0 }] };
    expect(validateSalesStep(belumDitagih, "faktur").join(" ")).toMatch(/Belum ada barang yang ditagihkan/);

    const kelebihan = { ...draft, lines: [{ ...draft.lines[0], billQuantity: 1500 }] };
    expect(validateSalesStep(kelebihan, "faktur").join(" ")).toMatch(/melebihi yang dipesan/);
  });

  it("ringkasan mengulang seluruh penjaga langkah sebelumnya", () => {
    const draft = { ...completeSalesDraft(), invoice: { ...completeSalesDraft().invoice, invoiceNo: "" } };
    expect(validateSalesStep(draft, "ringkasan").join(" ")).toMatch(/Nomor tagihan wajib/);
    expect(firstBlockedSalesStep(draft)).toBe("faktur");
  });

  it("langkah pertama yang bermasalah dilaporkan menurut urutan tampil", () => {
    const draft = emptySalesDraft(TODAY);
    expect(firstBlockedSalesStep(draft)).toBe("pelanggan");
  });
});

describe("penjaga langkah pembelian", () => {
  it("draf lengkap tidak menahan langkah mana pun", () => {
    const draft = completePurchaseDraft();
    for (const step of PURCHASE_STEPS) {
      expect(validatePurchaseStep(draft, step.id)).toEqual([]);
    }
    expect(firstBlockedPurchaseStep(draft)).toBeNull();
  });

  it("harga beli nol ditahan — pembelian tanpa nilai bukan pembelian", () => {
    const draft = completePurchaseDraft();
    const gratis = { ...draft, lines: [{ ...draft.lines[0], price: 0 }] };
    expect(validatePurchaseStep(gratis, "barang").join(" ")).toMatch(/harus lebih besar dari 0/);
  });

  it("barang masuk yang melebihi yang dibeli ditahan", () => {
    const draft = completePurchaseDraft();
    const kelebihan = { ...draft, lines: [{ ...draft.lines[0], receiveQuantity: 900 }] };
    expect(validatePurchaseStep(kelebihan, "penerimaan").join(" ")).toMatch(/melebihi yang dibeli/);
  });

  it("langkah barang masuk yang DILEWATI tidak menahan apa pun", () => {
    const draft = completePurchaseDraft();
    const lewat = { ...draft, receipt: { ...draft.receipt, include: false } };
    expect(validatePurchaseStep(lewat, "penerimaan", { closedPeriods: [{ year: 2026, month: 7 }] })).toEqual(
      []
    );
  });

  it("pembelian valas tanpa kurs, dan PPN negatif, ditahan", () => {
    const draft = completePurchaseDraft();
    const valas = { ...draft, purchase: { ...draft.purchase, currency: "USD", rate: 0 } };
    expect(validatePurchaseStep(valas, "pembelian").join(" ")).toMatch(/Kurs ke IDR wajib diisi/);

    const ppnNegatif = { ...draft, purchase: { ...draft.purchase, taxAmount: -1 } };
    expect(validatePurchaseStep(ppnNegatif, "pembelian").join(" ")).toMatch(/tidak boleh negatif/);
  });
});

/* ─────────────────────── 2. Serialisasi draf ─────────────────────── */

describe("draf: bertahan saat refresh, tetapi tidak bangkit basi", () => {
  const NOW = 1_800_000_000_000;

  it("bolak-balik utuh", () => {
    const draft = completeSalesDraft();
    const raw = serializeDraft("sales", draft, NOW);
    const read = parseDraft<SalesDraft>("sales", raw, NOW + 1000);
    expect(read.reason).toBeNull();
    expect(read.draft).toEqual(draft);
    expect(read.savedAt).toBe(NOW);
  });

  it("draf yang lewat 12 jam DIBUANG, bukan dipakai diam-diam", () => {
    const raw = serializeDraft("sales", completeSalesDraft(), NOW);
    // Sesaat sebelum batas masih dipakai …
    expect(parseDraft<SalesDraft>("sales", raw, NOW + DRAFT_TTL_MS - 1).draft).not.toBeNull();
    // … sesaat sesudahnya tidak.
    const kedaluwarsa = parseDraft<SalesDraft>("sales", raw, NOW + DRAFT_TTL_MS + 1);
    expect(kedaluwarsa.draft).toBeNull();
    expect(kedaluwarsa.reason).toBe("expired");
    expect(DRAFT_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });

  it("draf dari versi lain atau jenis wizard lain dibuang", () => {
    const lain = JSON.stringify({ version: DRAFT_VERSION + 1, kind: "sales", savedAt: NOW, draft: {} });
    expect(parseDraft("sales", lain, NOW).reason).toBe("version");

    const salahJenis = serializeDraft("purchase", completePurchaseDraft(), NOW);
    expect(parseDraft("sales", salahJenis, NOW).reason).toBe("kind");
  });

  it("penyimpanan kosong atau rusak tidak pernah melempar", () => {
    expect(parseDraft("sales", null, NOW).reason).toBe("empty");
    expect(parseDraft("sales", "", NOW).reason).toBe("empty");
    expect(parseDraft("sales", "{bukan json", NOW).reason).toBe("corrupt");
    expect(parseDraft("sales", JSON.stringify({ version: DRAFT_VERSION }), NOW).reason).toBe(
      "corrupt"
    );
  });

  it("setiap pembuangan punya kalimat penjelasan — tidak ada yang hilang diam-diam", () => {
    for (const reason of ["expired", "version", "kind", "corrupt"] as const) {
      expect(draftRejectionMessage(reason)).toMatch(/tersimpan/);
    }
    // Tidak ada draf sama sekali bukan sesuatu yang perlu dijelaskan.
    expect(draftRejectionMessage("empty")).toBeNull();
  });

  it("kunci penyimpanan dipisah per jenis wizard dan membawa versinya", () => {
    expect(draftStorageKey("sales")).not.toBe(draftStorageKey("purchase"));
    expect(draftStorageKey("sales")).toContain(`v${DRAFT_VERSION}`);
  });
});

/* ─────────────── 3. Sumbangan tiap langkah ke muatan akhir ─────────────── */

describe("hitungan turunan draf penjualan", () => {
  it("nilai pesanan, DPP, PPN, dan total tagihan", () => {
    const draft = completeSalesDraft();
    expect(salesOrderValue(draft)).toBe(50_000_000);
    expect(salesInvoiceSubtotal(draft)).toBe(50_000_000);
    // Default 11% (UU HPP) — angkanya datang dari @/lib/tax, bukan ditulis ulang.
    expect(salesInvoiceTax(draft)).toBe(5_500_000);
    expect(salesInvoiceTotal(draft)).toBe(55_500_000);
  });

  it("tagihan tanpa PPN tidak menambahkan apa pun", () => {
    const draft = completeSalesDraft();
    const bebas = { ...draft, invoice: { ...draft.invoice, taxable: false } };
    expect(salesInvoiceTax(bebas)).toBe(0);
    expect(salesInvoiceTotal(bebas)).toBe(salesInvoiceSubtotal(bebas));
  });

  it("kg dikirim = bags × kg/bag, dan 0 bila baris tidak dicentang", () => {
    const draft = completeSalesDraft();
    expect(shipKg(draft.lines[0])).toBe(1000);
    expect(shipKg({ ...draft.lines[0], ship: false })).toBe(0);
  });

  it("sisa draf dihitung dengan aritmetika dokumen berantai yang sama (#15)", () => {
    const draft = completeSalesDraft();
    const separuh = { ...draft, lines: [{ ...draft.lines[0], shipKgPerBag: 25 }] };
    const { lines } = salesDraftOutstanding(separuh);
    expect(lines).toHaveLength(1);
    expect(lines[0].contractedKg).toBe(1000);
    expect(lines[0].deliveredKg).toBe(500);
    expect(lines[0].readyToInvoiceKg).toBe(500);
  });
});

describe('pola "Ambil" di langkah 4', () => {
  it('"Ambil semua" mengisi jumlah tagihan dari yang dipesan', () => {
    const draft = { ...completeSalesDraft(), lines: [{ ...completeSalesDraft().lines[0], billQuantity: 0 }] };
    expect(applySalesPull(draft, "order").lines[0].billQuantity).toBe(1000);
  });

  it('"Ambil yang dikirim" hanya menarik yang benar-benar dicatat dikirim', () => {
    const base = completeSalesDraft();
    const separuh = { ...base, lines: [{ ...base.lines[0], shipKgPerBag: 25, billQuantity: 0 }] };
    expect(applySalesPull(separuh, "delivery").lines[0].billQuantity).toBe(500);
  });

  it("baris yang tidak dikirim ditarik nol, bukan dibiarkan basi", () => {
    const base = completeSalesDraft();
    const takDikirim = {
      ...base,
      lines: [{ ...base.lines[0], ship: false, billQuantity: 999 }],
    };
    expect(applySalesPull(takDikirim, "delivery").lines[0].billQuantity).toBe(0);
  });

  it("dua baris bernama sama dibagi sebanding, tidak digandakan", () => {
    const base = completeSalesDraft();
    const kembar: SalesDraft = {
      ...base,
      lines: [
        { ...base.lines[0], quantity: 600, billQuantity: 0 },
        { ...base.lines[0], quantity: 400, billQuantity: 0 },
      ],
    };
    const ditarik = applySalesPull(kembar, "order").lines.map((l) => l.billQuantity);
    expect(ditarik).toEqual([600, 400]);
    expect(ditarik[0] + ditarik[1]).toBe(1000);
  });
});

describe("muatan akhir penjualan", () => {
  it("membawa surat jalan dan faktur bersama satu tautan kontrak", () => {
    const draft = { ...completeSalesDraft(), contractId: 12 };
    const payload = buildSalesPayload(draft);

    expect(payload.contractId).toBe(12);
    expect(payload.customer).toEqual({ mode: "existing", id: 7 });
    expect(payload.delivery).not.toBeNull();
    expect(payload.delivery?.items).toEqual([
      { itemId: 3, itemName: "Kopi Arabika", bags: 20, kgPerBag: 50 },
    ]);
    expect(payload.invoice.invoiceNo).toBe("INV-001");
    expect(payload.invoice.items).toEqual([
      { itemName: "Kopi Arabika", quantity: 1000, price: 50_000, unit: "kg" },
    ]);
  });

  it("langkah 3 yang dilewati menghilangkan surat jalan dari muatan seluruhnya", () => {
    const base = completeSalesDraft();
    const tanpaKirim = { ...base, delivery: { ...base.delivery, include: false } };
    expect(buildSalesPayload(tanpaKirim).delivery).toBeNull();
    // Faktur tetap utuh — melewati pengiriman bukan membatalkan penjualan.
    expect(buildSalesPayload(tanpaKirim).invoice.items).toHaveLength(1);
  });

  it("baris di luar master stok tidak pernah masuk surat jalan, tetapi tetap ditagihkan", () => {
    const base = completeSalesDraft();
    const bebas = { ...base, lines: [{ ...base.lines[0], itemId: null }] };
    const payload = buildSalesPayload(bebas);
    expect(payload.delivery).toBeNull();
    expect(payload.invoice.items).toHaveLength(1);
  });

  it("baris yang tidak ditagihkan tidak menyelinap ke faktur", () => {
    const base = completeSalesDraft();
    const sebagian: SalesDraft = {
      ...base,
      lines: [
        { ...base.lines[0], billQuantity: 400 },
        { ...base.lines[0], itemName: "Kopi Robusta", itemId: null, ship: false, billQuantity: 0 },
      ],
    };
    const payload = buildSalesPayload(sebagian);
    expect(payload.invoice.items).toEqual([
      { itemName: "Kopi Arabika", quantity: 400, price: 50_000, unit: "kg" },
    ]);
  });

  it("pelanggan baru dikirim sebagai data, bukan sebagai id yang belum ada", () => {
    const base = completeSalesDraft();
    const baru: SalesDraft = {
      ...base,
      customer: {
        ...base.customer,
        mode: "new",
        id: null,
        name: "  PT Pembeli Baru  ",
        email: "beli@contoh.com",
        taxExempt: true,
      },
    };
    const payload = buildSalesPayload(baru);
    expect(payload.customer.mode).toBe("new");
    expect(payload.customer.id).toBeNull();
    expect(payload.customer.name).toBe("PT Pembeli Baru");
    expect(payload.customer.taxExempt).toBe(true);
  });

  it("kurs hanya ikut bila benar-benar diisi — 0 berarti belum diisi, bukan 0", () => {
    const base = completeSalesDraft();
    expect(buildSalesPayload(base).invoice.rate).toBeUndefined();
    const valas = { ...base, invoice: { ...base.invoice, currency: "USD", rate: 16_250 } };
    expect(buildSalesPayload(valas).invoice.rate).toBe(16_250);
  });
});

describe("muatan akhir pembelian", () => {
  it("nilai pembelian dan totalnya termasuk PPN Masukan", () => {
    const draft = completePurchaseDraft();
    expect(purchaseValue(draft)).toBe(20_000_000);
    const berppn = { ...draft, purchase: { ...draft.purchase, taxAmount: 2_200_000 } };
    expect(purchaseTotal(berppn)).toBe(22_200_000);
  });

  it("membawa pembelian dan barang masuk bersama", () => {
    const payload = buildPurchasePayload(completePurchaseDraft());
    expect(payload.purchase.type).toBe("purchase");
    expect(payload.purchase.amount).toBe(20_000_000);
    expect(payload.receipt?.items).toEqual([
      { itemId: 3, itemName: "Kopi Arabika", quantity: 500, unitCost: 40_000 },
    ]);
  });

  it("harga pokok stok dikonversi ke IDR memakai kurs pembelian", () => {
    const base = completePurchaseDraft();
    const valas: PurchaseDraft = {
      ...base,
      lines: [{ ...base.lines[0], price: 3 }],
      purchase: { ...base.purchase, currency: "USD", rate: 16_000 },
    };
    // stock.unit_cost SELALU IDR — 3 USD × 16.000 = 48.000 IDR per kg.
    expect(buildPurchasePayload(valas).receipt?.items[0].unitCost).toBe(48_000);
    expect(buildPurchasePayload(valas).purchase.amount).toBe(1_500);
  });

  it("langkah 3 yang dilewati menghilangkan barang masuk dari muatan", () => {
    const base = completePurchaseDraft();
    const lewat = { ...base, receipt: { ...base.receipt, include: false } };
    expect(buildPurchasePayload(lewat).receipt).toBeNull();
    // Utangnya tetap dicatat penuh — barang bisa menyusul.
    expect(buildPurchasePayload(lewat).purchase.amount).toBe(20_000_000);
  });

  it("barang di luar master stok tidak pernah masuk pergerakan stok", () => {
    const base = completePurchaseDraft();
    const bebas = { ...base, lines: [{ ...base.lines[0], itemId: null }] };
    expect(buildPurchasePayload(bebas).receipt).toBeNull();
  });

  it("rincian barang ikut ke catatan, karena satu pembelian tersimpan satu nilai", () => {
    const draft = completePurchaseDraft();
    const note = purchaseNote(draft);
    expect(note).toContain("Kopi Arabika");
    expect(note).toContain("500");
    expect(note.length).toBeLessThanOrEqual(500);

    const berkatatan = { ...draft, purchase: { ...draft.purchase, note: "Termin 30 hari" } };
    expect(purchaseNote(berkatatan)).toMatch(/^Termin 30 hari — /);
  });
});

/* ─── INVARIANT: wizard tidak boleh jadi jalan pintas yang lebih longgar ─── */

/**
 * Diperiksa dengan MEMBACA sumbernya, bukan menjalankannya — metode yang sama
 * dipakai #37/#38/#42 untuk aturan sejenis.
 *
 * Bahaya nyata sebuah endpoint wizard adalah ia perlahan menumbuhkan salinan
 * kedua dari aturan route biasa, lalu keduanya berbeda: faktur wizard tidak
 * dibatasi sisa kontrak, surat jalan wizard tidak memeriksa stok, atau — yang
 * terburuk — wizard menulis jurnalnya sendiri. Ketiganya adalah pernyataan
 * tentang KODE, jadi kode itulah yang dibaca.
 */
describe("INVARIANT: endpoint wizard memakai jalur yang sama dengan route biasa", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  const salesRoute = read("src/app/api/wizard/sales/route.ts");
  const purchaseRoute = read("src/app/api/wizard/purchase/route.ts");
  const writer = read("src/lib/document-writes.ts");

  it("menulis SELURUH wizard di dalam satu $transaction — kunci kriteria pembatalan", () => {
    for (const route of [salesRoute, purchaseRoute]) {
      expect(route).toContain("prisma.$transaction(");
      // Tepat satu; dua transaksi berarti kegagalan di transaksi kedua
      // meninggalkan hasil transaksi pertama.
      expect(route.match(/prisma\.\$transaction\(/g)).toHaveLength(1);
    }
  });

  it("memvalidasi dengan skema yang SUDAH ADA, bukan turunan wizard", () => {
    expect(salesRoute).toContain("invoiceSchema.safeParse(");
    expect(salesRoute).toContain("deliveryOrderSchema.safeParse(");
    expect(purchaseRoute).toContain("supplierTransactionSchema.safeParse(");
  });

  it("tidak pernah menulis dokumen atau jurnal langsung", () => {
    for (const route of [salesRoute, purchaseRoute]) {
      // Jurnal hanya boleh lahir dari mesin posting.
      expect(route).not.toContain("postJournal");
      expect(route).not.toContain("journalLine");
      expect(route).not.toContain("tx.journal");
      // Dokumen hanya boleh lahir dari writer bersama.
      expect(route).not.toContain("tx.invoice.create");
      expect(route).not.toContain("tx.deliveryOrder.create");
      expect(route).not.toContain("tx.supplierTransaction.create");
      expect(route).not.toContain("tx.stock.create");
    }
  });

  it("memanggil writer bersama, yaitu isi transaksi route biasa itu sendiri", () => {
    expect(salesRoute).toContain("createInvoiceInTx(");
    expect(salesRoute).toContain("createDeliveryOrderInTx(");
    expect(purchaseRoute).toContain("createSupplierTransactionInTx(");
    expect(purchaseRoute).toContain("createStockInMovementsInTx(");
  });

  it("writer bersama membawa setiap penjaga yang route biasa jalankan", () => {
    // #15 faktur tidak melebihi sisa kontrak; #14 stok tidak boleh negatif;
    // #25 ambang persetujuan sebelum posting; satu-satunya mesin jurnal.
    expect(writer).toContain("assertWithinContract(");
    expect(writer).toContain("contractOutstandingForInvoice(");
    expect(writer).toContain("assertStockAvailable(");
    expect(writer).toContain("ensureApprovalRequest(");
    expect(writer).toContain("postForSource(");
    // Tidak ada jurnal tulis tangan di dalam writer pun.
    expect(writer).not.toContain("postJournal");
    expect(writer).not.toContain("journalLine");
  });

  it("route biasa memakai writer yang sama — tidak ada versi kedua yang bisa melenceng", () => {
    expect(read("src/app/api/invoices/route.ts")).toContain("createInvoiceInTx(");
    expect(read("src/app/api/delivery-orders/route.ts")).toContain("createDeliveryOrderInTx(");
    expect(read("src/app/api/suppliers/[id]/transactions/route.ts")).toContain(
      "createSupplierTransactionInTx("
    );
  });

  it("membuat mitra baru DI DALAM transaksi, bukan sebelum", () => {
    // Kalau pelanggan dibuat lebih dulu di luar transaksi, faktur yang gagal
    // meninggalkan pelanggan yatim — persis yang dilarang kriteria #5.
    const salesTx = salesRoute.slice(salesRoute.indexOf("prisma.$transaction("));
    expect(salesTx).toContain("tx.customer.create(");
    const purchaseTx = purchaseRoute.slice(purchaseRoute.indexOf("prisma.$transaction("));
    expect(purchaseTx).toContain("tx.supplier.create(");
  });

  it("wizard penjualan TIDAK membuat kontrak — pendapatan tidak boleh dihitung dua kali", () => {
    // Kontrak dan faktur sama-sama memposting D: Piutang / K: Pendapatan.
    expect(salesRoute).not.toContain("contract.create");
    expect(salesRoute).not.toContain("createContractInTx");
  });
});

describe("Aksi Cepat menunjuk ke wizard (issue #5)", () => {
  it("Catat Penjualan & Catat Pembelian membuka alur terpandu, bukan formulir polos", () => {
    const byKey = new Map(QUICK_ACTIONS.map((a) => [a.key, a]));
    expect(byKey.get("catat_penjualan")?.href).toBe("/sales/new");
    expect(byKey.get("catat_pembelian")?.href).toBe("/purchases/new");
  });
});
