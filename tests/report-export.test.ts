/**
 * The Excel sheet-model builder (issue #19).
 *
 * The one hazard worth pinning: a money cell that no longer equals the report
 * figure it came from — either because it was turned into a formatted string, or
 * because it was re-rounded / float-mangled on the way into the sheet. Every
 * assertion here compares a money cell to the *exact* number in the payload the
 * report page produced (the same payload that feeds the PDF), including awkward
 * fractional values, so a regression that stringifies or drifts a figure fails
 * loudly. The pure builder is tested with no spreadsheet library present at all.
 */
import { describe, it, expect } from "vitest";
import { buildReportSheet, type SheetCell, type SheetModel } from "@/lib/report-export";
import type { StatementPayload } from "@/lib/pdf/statement-pdf";
import { statementPayloadSchema } from "@/lib/validations/report-export";

/** Money values, in row order, exactly as the builder placed them. */
function moneyValues(sheet: SheetModel): number[] {
  const out: number[] = [];
  for (const row of sheet.rows) {
    for (const cell of row) {
      if (cell.format === "money") {
        expect(typeof cell.value).toBe("number"); // never a string
        out.push(cell.value as number);
      }
    }
  }
  return out;
}

function cellFor(sheet: SheetModel, predicate: (label: string) => boolean): SheetCell[] {
  const row = sheet.rows.find(
    (r) => typeof r[0]?.value === "string" && predicate(r[0].value as string)
  );
  if (!row) throw new Error("row not found");
  return row;
}

describe("buildReportSheet — income statement", () => {
  const payload: StatementPayload = {
    kind: "income-statement",
    period: "Periode 1 Jan 2026 – 31 Jul 2026",
    sales: {
      lines: [
        { code: "4-100", name: "Penjualan Ekspor", amount: 1_234_567.89 },
        { code: "4-200", name: "Penjualan Lokal", amount: 500_000.5 },
      ],
      total: 1_734_568.39,
    },
    cogs: {
      lines: [{ code: "5-100", name: "Beban Pokok Penjualan", amount: 900_000.11 }],
      total: 900_000.11,
    },
    grossProfit: 834_568.28,
    operatingExpense: {
      lines: [{ code: "6-100", name: "Beban Gaji", amount: 400_000.33 }],
      total: 400_000.33,
    },
    operatingProfit: 434_567.95,
    otherIncome: {
      lines: [{ code: "7-100", name: "Selisih Kurs", amount: 10_000 }],
      total: 10_000,
    },
    otherExpense: {
      lines: [{ code: "8-100", name: "Beban Bunga", amount: 5_000 }],
      total: 5_000,
    },
    netIncome: 439_567.95,
  };

  it("carries every figure through as an exact number, in multi-step order", () => {
    const sheet = buildReportSheet(payload);
    expect(moneyValues(sheet)).toEqual([
      1_234_567.89,
      500_000.5,
      1_734_568.39, // Total Pendapatan
      900_000.11,
      900_000.11, // Total Beban Pokok Penjualan
      834_568.28, // LABA KOTOR
      400_000.33,
      400_000.33, // Total Beban Operasional
      434_567.95, // LABA USAHA
      10_000,
      10_000, // Total Pendapatan Lain-lain
      5_000,
      5_000, // Total Beban Lain-lain
      439_567.95, // Laba bersih
    ]);
  });

  it("prints the two step subtotals with their exact values", () => {
    const sheet = buildReportSheet(payload);
    expect(cellFor(sheet, (l) => l === "LABA KOTOR")[1].value).toBe(834_568.28);
    expect(cellFor(sheet, (l) => l === "LABA USAHA")[1].value).toBe(434_567.95);
  });

  /**
   * The collapse rule (see `@/lib/statement-layout`): a business with no HPP and
   * no other income/expense accounts must get exactly the single-step statement
   * it had before — no empty bands, and no "Laba Kotor" row merely restating
   * total revenue.
   */
  it("collapses to a single-step statement when the extra bands are empty", () => {
    const sheet = buildReportSheet({
      ...payload,
      cogs: { lines: [], total: 0 },
      grossProfit: 1_734_568.39,
      operatingProfit: 1_334_568.06,
      otherIncome: { lines: [], total: 0 },
      otherExpense: { lines: [], total: 0 },
      netIncome: 1_334_568.06,
    });
    const labels = sheet.rows.map((r) => String(r[0]?.value ?? ""));
    expect(labels).not.toContain("LABA KOTOR");
    expect(labels).not.toContain("LABA USAHA");
    expect(labels.filter((l) => l.startsWith("Total "))).toEqual([
      "Total Pendapatan",
      "Total Beban Operasional",
    ]);
    expect(moneyValues(sheet)).toEqual([
      1_234_567.89,
      500_000.5,
      1_734_568.39, // Total Pendapatan
      400_000.33,
      400_000.33, // Total Beban Operasional
      1_334_568.06, // Laba bersih
    ]);
  });

  it("labels a positive net as LABA BERSIH and keeps the exact value", () => {
    const sheet = buildReportSheet(payload);
    const row = cellFor(sheet, (l) => l.startsWith("LABA BERSIH"));
    expect(row[1].value).toBe(439_567.95);
  });

  it("labels a negative net as RUGI BERSIH", () => {
    const sheet = buildReportSheet({ ...payload, netIncome: -50_000 });
    const row = cellFor(sheet, (l) => l.startsWith("RUGI"));
    expect(row[1].value).toBe(-50_000);
  });

  it("does not stringify or re-round a fractional rupiah value", () => {
    const sheet = buildReportSheet(payload);
    // 1_234_567.89 must survive verbatim — not 1_234_568, not "1.234.567,89".
    expect(moneyValues(sheet)).toContain(1_234_567.89);
  });
});

describe("buildReportSheet — balance sheet", () => {
  const payload: StatementPayload = {
    kind: "balance-sheet",
    period: "Per 31 Jul 2026",
    assets: [{ code: "1-100", name: "Kas", amount: 9_000_000 }],
    liabilities: [{ code: "2-100", name: "Utang Usaha", amount: 2_000_000 }],
    equity: [{ code: "3-100", name: "Modal", amount: 5_000_000 }],
    totalAssets: 9_000_000,
    totalLiabilities: 2_000_000,
    totalEquity: 5_000_000,
    netIncome: 2_000_000,
    totalLiabilitiesEquity: 9_000_000,
    balanced: true,
  };

  it("matches the report totals exactly, and folds current earnings into equity", () => {
    const sheet = buildReportSheet(payload);
    expect(moneyValues(sheet)).toEqual([
      9_000_000, // Kas
      9_000_000, // Total Aset
      2_000_000, // Utang Usaha
      2_000_000, // Total Liabilitas
      5_000_000, // Modal
      2_000_000, // Laba / Rugi Berjalan
      7_000_000, // Total Ekuitas = totalEquity + netIncome
      9_000_000, // Total Liabilitas + Ekuitas
    ]);
  });

  it("flags an unbalanced sheet in the total label", () => {
    const sheet = buildReportSheet({ ...payload, balanced: false });
    const row = cellFor(sheet, (l) => l.includes("Total Liabilitas + Ekuitas"));
    expect(row[0].value).toContain("TIDAK SEIMBANG");
  });
});

describe("buildReportSheet — trial balance & cash flow", () => {
  it("keeps debit and credit columns as exact numbers", () => {
    const sheet = buildReportSheet({
      kind: "trial-balance",
      period: "Per 31 Jul 2026",
      rows: [{ code: "1-100", name: "Kas", debit: 1_500_000.75, credit: 0 }],
      totalDebit: 1_500_000.75,
      totalCredit: 1_500_000.75,
      balanced: true,
    });
    expect(moneyValues(sheet)).toEqual([1_500_000.75, 0, 1_500_000.75, 1_500_000.75]);
  });

  it("prints a non-empty uncategorised group and totals net change exactly", () => {
    const sheet = buildReportSheet({
      kind: "cash-flow",
      period: "Periode",
      groups: [
        {
          // `category` wajib sejak issue #241 — bentuk laporan bergantung
          // padanya, bukan pada label yang bisa saja sudah diterjemahkan.
          category: "uncategorised",
          label: "Belum Terkategori",
          lines: [{ code: "9-999", name: "Akun Aneh", inflow: 250_000.25, outflow: 0, net: 250_000.25 }],
          inflow: 250_000.25,
          outflow: 0,
          net: 250_000.25,
        },
      ],
      totalInflow: 250_000.25,
      totalOutflow: 0,
      netChange: 250_000.25,
      openingCash: 1_000_000,
      closingCash: 1_250_000.25,
      reconciled: true,
      suspectUnrated: 0,
    });
    const values = moneyValues(sheet);
    expect(values).toContain(250_000.25);
    expect(values).toContain(1_000_000); // opening
    expect(values).toContain(1_250_000.25); // closing
    // The uncategorised section is present, never dropped.
    const heading = sheet.rows.find((r) => r[0]?.value === "Belum Terkategori");
    expect(heading).toBeDefined();
  });

  /*
   * Kelompok TANPA akun (issue #241). Lembar sebar dulu melewatinya
   * (`if (g.lines.length === 0) continue`) sementara layar tetap mencetaknya —
   * beda bentuk yang paling terlihat pengguna, karena periode tanpa mutasi
   * investasi kehilangan seluruh seksinya di lampiran. Sekarang ketiga
   * permukaan mencetaknya; kesamaannya sendiri dijaga
   * `tests/cash-flow-shape.test.ts`, dan di sini dikunci apa yang harus
   * TERBACA di berkas Excel-nya.
   */
  it("mencetak seksi tanpa akun berikut alasannya, bukan melewatinya", () => {
    const sheet = buildReportSheet({
      kind: "cash-flow",
      period: "Periode",
      groups: [
        {
          category: "investing",
          label: "Aktivitas Investasi",
          lines: [],
          inflow: 0,
          outflow: 0,
          net: 0,
        },
      ],
      totalInflow: 0,
      totalOutflow: 0,
      netChange: 0,
      openingCash: 500_000,
      closingCash: 500_000,
      reconciled: true,
      suspectUnrated: 0,
    });
    const labels = sheet.rows.map((r) => r[0].value);
    expect(labels).toContain("Aktivitas Investasi");
    expect(labels).toContain("Tidak ada pergerakan kas pada periode ini.");
    expect(labels).toContain("Jumlah Aktivitas Investasi");
  });

  /*
   * Kas awal & akhir adalah baris tabel — kolom "Masuk"/"Keluar" tidak berlaku
   * bagi keduanya, jadi selnya KOSONG dan bukan nol (Prinsip Inti MASTER.md).
   * Subtotal nol tetap angka nol: satu-satunya alasan lembar sebar ada adalah
   * agar kolomnya bisa dijumlah, dan "-" mematikan `SUM`.
   */
  it("mengosongkan kolom yang tak berlaku, tapi menyimpan nol sebagai angka", () => {
    const sheet = buildReportSheet({
      kind: "cash-flow",
      period: "Periode",
      groups: [
        {
          category: "operating",
          label: "Aktivitas Operasi",
          lines: [{ code: "4-100", name: "Penjualan", inflow: 750_000, outflow: 0, net: 750_000 }],
          inflow: 750_000,
          outflow: 0,
          net: 750_000,
        },
      ],
      totalInflow: 750_000,
      totalOutflow: 0,
      netChange: 750_000,
      openingCash: 250_000,
      closingCash: 1_000_000,
      reconciled: true,
      suspectUnrated: 0,
    });
    const opening = sheet.rows[0];
    expect(opening[0].value).toBe("Kas & setara kas awal periode");
    expect(opening[1].value).toBeNull();
    expect(opening[2].value).toBeNull();
    expect(opening[3].value).toBe(250_000);

    const line = sheet.rows.find((r) => r[0].value === "4-100  Penjualan")!;
    expect(line[2].value).toBe(0);
    expect(line[3].value).toBe(750_000);
  });

  /*
   * Judul kolom kini datang dari `CASH_FLOW_HEADERS`, bersama PDF. Kolom
   * pertama berganti dari "Keterangan" ke judul yang dipakai layar; itu
   * perubahan yang TERLIHAT di berkas ekspor, dan disengaja.
   */
  it("memakai judul kolom yang sama dengan cetakan", () => {
    const sheet = buildReportSheet({
      kind: "cash-flow",
      period: "Periode",
      groups: [],
      totalInflow: 0,
      totalOutflow: 0,
      netChange: 0,
      openingCash: 0,
      closingCash: 0,
      reconciled: true,
      suspectUnrated: 0,
    });
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "Sumber / Penggunaan Kas",
      "Kas Masuk (IDR)",
      "Kas Keluar (IDR)",
      "Bersih (IDR)",
    ]);
  });
});

/**
 * Pilihan kolom (dialog parameter Pusat Laporan) — satu penentu untuk tiga
 * permukaan. Yang dijaga di sini: lembar sebar mengikuti pilihan yang sama,
 * dan pilihan itu tidak pernah bisa MENAMBAH kolom yang laporannya tak punya.
 */
describe("kolom Riwayat Stok yang dipilih pengguna", () => {
  const base = {
    kind: "stock-movement" as const,
    period: "Periode 1 Mei 2026 – 31 Mei 2026",
    rows: [
      {
        name: "Kopi Arabika",
        unit: "kg",
        opening: 100,
        movedIn: 50,
        movedOut: 20,
        processed: 0,
        closing: 130,
      },
    ],
    totalOpening: 100,
    totalIn: 50,
    totalOut: 20,
    totalProcessed: 0,
    totalClosing: 130,
    hasProcess: false,
    dormantCount: 0,
  };

  it("mempersempit lembar sebar ke kolom yang dipilih, identitas tetap ikut", () => {
    const sheet = buildReportSheet({ ...base, visibleColumns: ["closing"] });
    expect(sheet.columns.map((c) => c.header)).toEqual(["Barang", "Saldo Akhir"]);
    expect(sheet.rows[0]).toHaveLength(2);
    // Barisnya tetap baris yang sama — nilainya tidak ikut bergeser kolom.
    expect(sheet.rows[0][0].value).toBe("Kopi Arabika");
    expect(sheet.rows[0][1].value).toBe(130);
    // Baris total pun mengikuti susunan kolom yang sama.
    expect(sheet.rows.at(-1)?.[1].value).toBe(130);
  });

  it("tidak memunculkan kolom Diolah di periode tanpa mutasi olah, walau dicentang", () => {
    const sheet = buildReportSheet({ ...base, visibleColumns: ["processed", "closing"] });
    expect(sheet.columns.map((c) => c.header)).toEqual(["Barang", "Saldo Akhir"]);
  });

  it("tanpa pilihan apa pun, seluruh kolom yang berisi tetap tercetak", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "Barang",
      "Satuan",
      "Saldo Awal",
      "Masuk",
      "Keluar",
      "Saldo Akhir",
    ]);
  });
});

/**
 * Rekap per mitra — dua laporan berbentuk sama, satu pembangun.
 *
 * Termasuk penjaga untuk kelas kegagalan yang tidak terlihat dari tipe: skema
 * zod MENANGGALKAN kunci yang tak dideklarasikannya, jadi `visibleColumns` yang
 * lupa ditulis di skema tidak ditolak — ia hilang diam-diam dan lembar sebarnya
 * memuat seluruh kolom seolah pengguna tak pernah memilih apa pun.
 */
describe("rekap per mitra", () => {
  const base = {
    kind: "sales-by-customer" as const,
    period: "Periode 1 Januari 2026 – 31 Maret 2026",
    rows: [
      {
        partyName: "PT Kopi Nusantara",
        docCount: 3,
        grossBase: 15_000_000,
        returnBase: 1_000_000,
        netBase: 14_000_000,
        unratedCount: 0,
      },
      {
        partyName: null,
        docCount: 1,
        grossBase: 2_000_000,
        returnBase: 0,
        netBase: 2_000_000,
        unratedCount: 1,
      },
    ],
    totals: {
      docCount: 4,
      grossBase: 17_000_000,
      returnBase: 1_000_000,
      netBase: 16_000_000,
      unratedCount: 1,
    },
  };

  it("memberi nama pada baris tanpa mitra, bukan sel kosong", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows[1][0].value).toBe("Tanpa pelanggan");
  });

  it("menuliskan retur sebagai pengurang bertanda, bukan angka positif", () => {
    const sheet = buildReportSheet(base);
    // Kolom: party, docCount, gross, returns, net
    expect(sheet.rows[0][3].value).toBe(-1_000_000);
  });

  it("jumlah dokumen tetap cacah — tidak meminjam topeng rupiah", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows[0][1].value).toBe(3);
    expect(sheet.rows[0][1].format).toBeUndefined();
    expect(sheet.rows[0][2].format).toBe("money");
  });

  it("menyebutkan dokumen valas tanpa kurs yang tidak ikut dijumlahkan", () => {
    const sheet = buildReportSheet(base);
    expect(String(sheet.rows.at(-1)?.[0].value)).toContain("tidak ikut dijumlahkan");
  });

  it("mengikuti pilihan kolom, identitas mitra tetap ikut", () => {
    const sheet = buildReportSheet({ ...base, visibleColumns: ["net"] });
    expect(sheet.columns.map((c) => c.header)).toEqual(["Pelanggan", "Bersih (IDR)"]);
  });

  it("memberi judul & label kolom sendiri untuk sisi pembelian", () => {
    const sheet = buildReportSheet({ ...base, kind: "purchases-by-supplier" });
    expect(sheet.title).toBe("Pembelian per Pemasok");
    expect(sheet.columns[0].header).toBe("Pemasok");
    expect(sheet.columns[2].header).toBe("Pembelian Kotor (IDR)");
  });

  it("skema ekspor mempertahankan pilihan kolom, tidak menanggalkannya", () => {
    const parsed = statementPayloadSchema.parse({ ...base, visibleColumns: ["net"] });
    expect(parsed).toHaveProperty("visibleColumns", ["net"]);
  });

  it("skema ekspor menerima kedua sisi rekap", () => {
    expect(statementPayloadSchema.safeParse(base).success).toBe(true);
    expect(
      statementPayloadSchema.safeParse({ ...base, kind: "purchases-by-supplier" }).success
    ).toBe(true);
  });
});

/**
 * Umur Piutang / Umur Utang — dokumen belum lunas per satu tanggal.
 *
 * Yang dijaga: dokumen valas TANPA KURS tidak boleh menjadi nol di lembar
 * sebar. Nol adalah pernyataan "tidak ada sisa"; yang benar adalah "nilainya
 * tidak diketahui", dan menuliskannya sebagai nol menyusutkan total tanpa
 * bersuara — persis kegagalan yang `unresolved` ada untuk mencegahnya.
 */
describe("umur piutang / utang", () => {
  const base = {
    kind: "receivables" as const,
    period: "Per 5 Agustus 2026",
    rows: [
      {
        partyName: "PT Kopi Nusantara",
        documentNo: "INV-001",
        date: "1 Juli 2026",
        dueDate: "31 Juli 2026",
        ageDays: 5,
        ageFromIssue: false,
        status: "Jatuh Tempo",
        total: 10_000_000,
        currency: "IDR",
        outstandingBase: 10_000_000,
      },
      {
        partyName: "Coffee Buyers Ltd",
        documentNo: "INV-002",
        date: "2 Juli 2026",
        dueDate: null,
        ageDays: 34,
        ageFromIssue: true,
        status: "Belum Bayar",
        total: 5_000,
        currency: "USD",
        outstandingBase: null,
      },
    ],
    buckets: [
      { label: "0–30 hari", amount: 10_000_000 },
      { label: "31–60 hari", amount: 0 },
      { label: "61–90 hari", amount: 0 },
      { label: "> 90 hari", amount: 0 },
    ],
    total: 10_000_000,
    unresolved: 1,
  };

  it("membiarkan sisa dokumen tanpa kurs KOSONG, bukan nol", () => {
    const sheet = buildReportSheet(base);
    const row = sheet.rows.find((r) => r[1].value === "INV-002");
    expect(row?.[7].value).toBeNull();
    // Sedangkan dokumen ber-IDR tetap angka yang bisa dijumlahkan.
    const rated = sheet.rows.find((r) => r[1].value === "INV-001");
    expect(rated?.[7].value).toBe(10_000_000);
    expect(rated?.[7].format).toBe("money");
  });

  it("menandai umur yang dihitung dari tanggal dokumen, dan menjelaskannya", () => {
    const sheet = buildReportSheet(base);
    const row = sheet.rows.find((r) => r[1].value === "INV-002");
    expect(row?.[4].value).toBe("34 *");
    expect(sheet.rows.some((r) => String(r[0].value).startsWith("* Umur dihitung"))).toBe(true);
  });

  it("menyebutkan dokumen yang tidak ikut dijumlahkan", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows.some((r) => String(r[0].value).includes("tidak ikut dijumlahkan"))).toBe(true);
  });

  it("membawa ringkasan ember beserta totalnya", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows[0][0].value).toBe("Ringkasan umur");
    expect(sheet.rows[1][0].value).toBe("0–30 hari");
    expect(sheet.rows[1][7].value).toBe(10_000_000);
  });

  it("memberi judul & nama lembar sendiri untuk sisi utang", () => {
    const sheet = buildReportSheet({ ...base, kind: "payables" });
    expect(sheet.title).toBe("Utang & Umur Utang");
    expect(sheet.columns[0].header).toBe("Pemasok");
  });

  it("skema ekspor menerima sisa yang null tanpa mengubahnya jadi nol", () => {
    const parsed = statementPayloadSchema.parse(base);
    expect(parsed).toMatchObject({ kind: "receivables" });
    if (parsed.kind === "receivables") {
      expect(parsed.rows[1].outstandingBase).toBeNull();
    }
  });
});

describe("nilai persediaan", () => {
  const base = {
    kind: "stock-value" as const,
    period: "Per 5 Agustus 2026",
    rows: [
      { name: "Kopi Arabika", unit: "kg", currentStock: 1200.5, unitCost: 45_000, stockValue: 54_022_500 },
      { name: "Karung bekas", unit: "pcs", currentStock: 40, unitCost: null, stockValue: null },
    ],
    totalValue: 54_022_500,
    uncostedCount: 1,
  };

  it("membiarkan barang tanpa dasar biaya KOSONG, bukan Rp 0", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows[1][3].value).toBeNull();
    expect(sheet.rows[1][4].value).toBeNull();
  });

  it("saldo tetap kuantitas — tidak dibulatkan topeng rupiah", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows[0][2].value).toBe(1200.5);
    expect(sheet.rows[0][2].format).toBe("quantity");
    expect(sheet.rows[0][4].format).toBe("money");
  });

  it("menyebutkan barang bersaldo yang nilainya tidak ikut dijumlahkan", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows.some((r) => String(r[0].value).includes("belum punya dasar biaya"))).toBe(true);
  });

  it("mengikuti pilihan kolom, nama barang tetap ikut", () => {
    const sheet = buildReportSheet({ ...base, visibleColumns: ["stockValue"] });
    expect(sheet.columns.map((c) => c.header)).toEqual(["Barang", "Nilai (IDR)"]);
  });

  it("skema ekspor menerimanya dengan nilai null utuh", () => {
    const parsed = statementPayloadSchema.parse(base);
    if (parsed.kind === "stock-value") expect(parsed.rows[1].stockValue).toBeNull();
  });
});

describe("laporan kas & bank", () => {
  const base = {
    kind: "cash-bank" as const,
    period: "Periode 1 Juli 2026 – 31 Juli 2026",
    rows: [
      { code: "1101", name: "Kas", opening: 5_000_000, net: -1_000_000, closing: 4_000_000 },
      { code: "1102", name: "Bank BCA", opening: 100_000_000, net: 25_000_000, closing: 125_000_000 },
    ],
    openingCash: 105_000_000,
    netChange: 24_000_000,
    closingCash: 129_000_000,
  };

  it("menggabungkan kode & nama akun dalam satu kolom identitas", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows[0][0].value).toBe("1101  Kas");
  });

  it("membawa total yang cocok dengan arus kas periodenya", () => {
    const sheet = buildReportSheet(base);
    const total = sheet.rows.at(-1);
    expect(total?.[1].value).toBe(105_000_000);
    expect(total?.[2].value).toBe(24_000_000);
    expect(total?.[3].value).toBe(129_000_000);
  });

  it("mengikuti pilihan kolom, akun tetap ikut", () => {
    const sheet = buildReportSheet({ ...base, visibleColumns: ["closing"] });
    expect(sheet.columns.map((c) => c.header)).toEqual(["Akun Kas & Bank", "Saldo Akhir (IDR)"]);
  });

  it("skema ekspor menerima perubahan bernilai negatif", () => {
    const parsed = statementPayloadSchema.parse(base);
    if (parsed.kind === "cash-bank") expect(parsed.rows[0].net).toBe(-1_000_000);
  });
});

describe("kolom umur piutang yang dipilih pengguna", () => {
  const base = {
    kind: "receivables" as const,
    period: "Per 5 Agustus 2026",
    rows: [
      {
        partyName: "PT Kopi Nusantara",
        documentNo: "INV-001",
        date: "1 Juli 2026",
        dueDate: "31 Juli 2026",
        ageDays: 5,
        ageFromIssue: false,
        status: "Jatuh Tempo",
        total: 10_000_000,
        currency: "IDR",
        outstandingBase: 10_000_000,
      },
    ],
    buckets: [
      { label: "0–30 hari", amount: 10_000_000 },
      { label: "> 90 hari", amount: 0 },
    ],
    total: 10_000_000,
    unresolved: 0,
  };

  it("mempersempit kolom, mitra tetap ikut", () => {
    const sheet = buildReportSheet({ ...base, visibleColumns: ["outstanding"] });
    expect(sheet.columns.map((c) => c.header)).toEqual(["Pelanggan", "Sisa (IDR)"]);
    const row = sheet.rows.find((r) => r[0].value === "PT Kopi Nusantara");
    expect(row?.[1].value).toBe(10_000_000);
  });

  it("ringkasan ember tetap menempel di kolom terakhir yang tampil", () => {
    const sheet = buildReportSheet({ ...base, visibleColumns: ["outstanding"] });
    const bucket = sheet.rows.find((r) => r[0].value === "0–30 hari");
    expect(bucket).toHaveLength(2);
    expect(bucket?.[1].value).toBe(10_000_000);
  });

  it("bertahan saat hanya kolom identitas yang tersisa", () => {
    // `party` fixed, jadi daftar yang hanya berisi id asing tetap menyisakannya.
    const sheet = buildReportSheet({ ...base, visibleColumns: ["party"] });
    expect(sheet.columns).toHaveLength(1);
    expect(sheet.rows.every((r) => r.length === 1)).toBe(true);
  });
});

describe("realisasi vs anggaran", () => {
  const base = {
    kind: "budget-realization" as const,
    period: "Juli 2026",
    rows: [
      {
        code: "5101",
        name: "Beban Gaji",
        budget: 50_000_000,
        actual: 56_000_000,
        variance: 6_000_000,
        variancePct: 12,
        status: "Di atas anggaran",
      },
      {
        code: "5201",
        name: "Beban Sewa",
        budget: 0,
        actual: 3_000_000,
        variance: 3_000_000,
        variancePct: null,
        status: "Di atas anggaran",
      },
    ],
    totalBudget: 50_000_000,
    totalActual: 59_000_000,
    totalVariance: 9_000_000,
    totalVariancePct: 18,
    alertCount: 2,
    salesTarget: { target: 200_000_000, actual: 180_000_000, variance: -20_000_000 },
  };

  it("persen tak terdefinisi tetap kosong, bukan 0%", () => {
    const sheet = buildReportSheet(base);
    // Kolom: account, budget, actual, variance, variancePct, status
    expect(sheet.rows[1][4].value).toBeNull();
    expect(sheet.rows[0][4].value).toBe(12);
  });

  it("arah selisih terbaca sebagai kata, bukan warna", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows[0][5].value).toBe("Di atas anggaran");
  });

  it("menyebutkan berapa akun melewati ambang di baris total", () => {
    const sheet = buildReportSheet(base);
    const total = sheet.rows.find((r) => String(r[0].value).includes("Total"));
    expect(String(total?.[5].value)).toContain("2 akun");
  });

  it("membawa blok target penjualan periode yang sama", () => {
    const sheet = buildReportSheet(base);
    expect(sheet.rows.some((r) => r[0].value === "Target Penjualan")).toBe(true);
    expect(sheet.rows.some((r) => String(r[0].value).includes("Total penjualan"))).toBe(true);
  });

  it("tanpa target sama sekali, bloknya tidak dicetak", () => {
    const sheet = buildReportSheet({ ...base, salesTarget: null });
    expect(sheet.rows.some((r) => r[0].value === "Target Penjualan")).toBe(false);
  });

  it("skema ekspor menerima persen null dan target null", () => {
    expect(statementPayloadSchema.safeParse(base).success).toBe(true);
    expect(statementPayloadSchema.safeParse({ ...base, salesTarget: null }).success).toBe(true);
  });
});
