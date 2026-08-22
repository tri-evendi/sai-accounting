/**
 * Pencocokan Accurate ↔ buku sendiri, rancangan saldo awal, dan dua jembatan
 * yang membuat ekspor Accurate bisa masuk lewat impor yang sudah ada.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  matchEntries,
  reconcileAccount,
  reconcileLedgerReport,
  type SaiLedgerRow,
  type SaiLedgerSide,
} from "@/lib/accurate/reconcile";
import { buildOpeningDraft, type ResolvedAccount } from "@/lib/accurate/opening-draft";
import type { AccurateLedgerAccount, AccurateLedgerEntry } from "@/lib/accurate/ledger-report";
import { flattenAccurateReport } from "@/lib/accurate/report-sheet";
import { parseCoaRows } from "@/lib/coa-import";
import { readFirstSheetRows } from "@/lib/xlsx-read";
import { parseImportDate } from "@/lib/import/fields";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let nextRow = 1;
function entry(part: Partial<AccurateLedgerEntry> = {}): AccurateLedgerEntry {
  nextRow += 1;
  return {
    row: nextRow,
    date: day("2025-01-10"),
    transactionType: "Faktur Pembelian",
    description: "DOC-1",
    reference: "SAI 00100",
    debit: 1000,
    credit: 0,
    printedBalance: null,
    ...part,
  };
}

let nextLine = 100;
function saiRow(part: Partial<SaiLedgerRow> = {}): SaiLedgerRow {
  nextLine += 1;
  return {
    lineId: nextLine,
    journalId: nextLine,
    number: "JV.2025.01.00001",
    date: day("2025-01-10"),
    memo: "",
    debit: 1000,
    credit: 0,
    ...part,
  };
}

function account(part: Partial<AccurateLedgerAccount> = {}): AccurateLedgerAccount {
  return {
    code: "5100006004",
    name: "BIAYA ASURANSI EKSPORT",
    openingDate: day("2024-12-31"),
    opening: 0,
    entries: [],
    sumDebit: 0,
    sumCredit: 0,
    printedTotalDebit: null,
    printedTotalCredit: null,
    closing: 0,
    printedClosing: null,
    warnings: [],
    ...part,
  };
}

describe("matchEntries", () => {
  it("mendahulukan kecocokan penuh: tanggal + nominal + referensi", () => {
    const a = entry({ reference: "SAI 00100" });
    const weak = saiRow({ memo: "tanpa referensi" });
    const strong = saiRow({ memo: "impor SAI 00100" });
    // yang lemah sengaja berdiri LEBIH DULU dalam daftar
    const { matches } = matchEntries([a], [weak, strong]);
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe("exact");
    expect(matches[0].sai.lineId).toBe(strong.lineId);
  });

  it("jatuh ke tanggal + nominal bila referensinya tak terbaca di sisi kita", () => {
    const { matches } = matchEntries([entry()], [saiRow({ memo: "" })]);
    expect(matches[0].kind).toBe("amount_date");
    expect(matches[0].dayShift).toBe(0);
  });

  it("mencocokkan lewat referensi walau tanggalnya bergeser, dan menyebut gesernya", () => {
    const a = entry({ date: day("2025-01-10"), reference: "SAI 00100" });
    const r = saiRow({ date: day("2025-01-13"), memo: "SAI 00100" });
    const { matches, onlyInAccurate, onlyInSai } = matchEntries([a], [r]);
    expect(matches[0].kind).toBe("reference_only");
    expect(matches[0].dayShift).toBe(3);
    expect(onlyInAccurate).toEqual([]);
    expect(onlyInSai).toEqual([]);
  });

  it("tidak pernah memakai satu baris kita untuk dua baris Accurate", () => {
    const a1 = entry({ description: "DOC-1", reference: "" });
    const a2 = entry({ description: "DOC-2", reference: "" });
    const only = saiRow({ memo: "" });
    const { matches, onlyInAccurate } = matchEntries([a1, a2], [only]);
    expect(matches).toHaveLength(1);
    expect(onlyInAccurate).toHaveLength(1);
  });

  it("tidak mencocokkan hanya dari nominal", () => {
    const a = entry({ date: day("2025-01-10"), reference: "TIDAK-ADA" });
    const r = saiRow({ date: day("2025-06-30"), memo: "lain sama sekali" });
    const { matches, onlyInAccurate, onlyInSai } = matchEntries([a], [r]);
    expect(matches).toEqual([]);
    expect(onlyInAccurate).toHaveLength(1);
    expect(onlyInSai).toHaveLength(1);
  });

  it("mengabaikan referensi terlalu pendek — ia cocok dengan segalanya", () => {
    const a = entry({ reference: "1", description: "X", date: day("2025-01-10") });
    const r = saiRow({ number: "JV.2025.01.00001", memo: "", date: day("2025-02-02") });
    const { matches } = matchEntries([a], [r]);
    expect(matches).toEqual([]);
  });
});

describe("reconcileAccount", () => {
  const side = (part: Partial<SaiLedgerSide> = {}): SaiLedgerSide => ({
    accountId: 7,
    code: "5100006004",
    name: "Beban Asuransi Ekspor",
    opening: 0,
    closing: 1000,
    totalDebit: 1000,
    totalCredit: 0,
    rows: [saiRow()],
    ...part,
  });

  it("menyebut bukunya cocok ketika seluruh angkanya sama", () => {
    const result = reconcileAccount(
      account({ entries: [entry()], sumDebit: 1000, closing: 1000 }),
      side()
    );
    expect(result.status).toBe("balanced");
    expect(result.difference).toEqual({ opening: 0, debit: 0, credit: 0, closing: 0 });
  });

  it("selisihnya berarah `sai − accurate`", () => {
    const result = reconcileAccount(
      account({ entries: [entry()], sumDebit: 1000, closing: 1000 }),
      side({ totalDebit: 1200, closing: 1200 })
    );
    expect(result.status).toBe("difference");
    expect(result.difference.debit).toBe(200);
    expect(result.difference.closing).toBe(200);
  });

  it("cocok menurut ANGKA meski barisnya tak berpasangan satu-satu", () => {
    // dua baris Accurate bernilai 500 vs satu jurnal gabungan 1000 di sisi kita
    const result = reconcileAccount(
      account({
        entries: [
          entry({ debit: 500, reference: "A-1", date: day("2025-01-10") }),
          entry({ debit: 500, reference: "A-2", date: day("2025-01-11") }),
        ],
        sumDebit: 1000,
        closing: 1000,
      }),
      side({ rows: [saiRow({ debit: 1000, date: day("2025-01-31"), memo: "gabungan" })] })
    );
    expect(result.status).toBe("balanced");
    expect(result.onlyInAccurate).toHaveLength(2);
    expect(result.onlyInSai).toHaveLength(1);
  });

  it("akun yang belum ada di sini ditandai, bukan didiamkan", () => {
    const result = reconcileAccount(account({ entries: [entry()], sumDebit: 1000, closing: 1000 }), null);
    expect(result.status).toBe("missing_in_sai");
    expect(result.sai).toBeNull();
    expect(result.difference.closing).toBe(-1000);
    expect(result.onlyInAccurate).toHaveLength(1);
  });
});

describe("reconcileLedgerReport", () => {
  it("meringkas seluruh akun sekaligus", () => {
    const meta = {
      company: "PT CONTOH",
      title: "Rincian Buku Besar",
      period: null,
      filter: null,
      printedAt: null,
      pageCount: null,
    };
    const cocok = account({ code: "A", entries: [entry()], sumDebit: 1000, closing: 1000 });
    const hilang = account({ code: "B", entries: [entry()], sumDebit: 500, closing: 500 });
    const sides = new Map<string, SaiLedgerSide>([
      [
        "A",
        {
          accountId: 1,
          code: "A",
          name: "A",
          opening: 0,
          closing: 1000,
          totalDebit: 1000,
          totalCredit: 0,
          rows: [saiRow()],
        },
      ],
    ]);
    const result = reconcileLedgerReport(meta, [cocok, hilang], sides);
    expect(result.summary).toMatchObject({
      accounts: 2,
      balanced: 1,
      missingInSai: 1,
      withDifference: 0,
    });
  });
});

describe("buildOpeningDraft", () => {
  const coa: Record<string, ResolvedAccount> = {
    "1101": { accountId: 1, code: "1101", name: "Kas", normalBalance: "debit", currency: "IDR" },
    "2101": { accountId: 2, code: "2101", name: "Utang Usaha", normalBalance: "credit", currency: "IDR" },
  };
  const resolve = (code: string) => coa[code] ?? null;

  it("menaruh saldo pada sisi normal akun menurut bagan akun KITA", () => {
    const draft = buildOpeningDraft(
      [
        account({ code: "1101", name: "KAS BESAR", closing: 5000 }),
        account({ code: "2101", name: "HUTANG USAHA", closing: 3000 }),
      ],
      resolve,
      day("2025-12-31")
    );
    expect(draft.rows[0]).toMatchObject({ side: "debit", amount: 5000, status: "ready" });
    expect(draft.rows[1]).toMatchObject({ side: "credit", amount: 3000, status: "ready" });
    expect(draft.totals).toEqual({ debit: 5000, credit: 3000, equityPlug: 2000 });
  });

  it("saldo negatif membalik SISINYA, bukan membiarkan nominal negatif", () => {
    const draft = buildOpeningDraft([account({ code: "1101", closing: -750 })], resolve, null);
    expect(draft.rows[0]).toMatchObject({ side: "credit", amount: 750 });
    expect(draft.totals.credit).toBe(750);
  });

  it("menolak menebak sisi untuk akun yang belum ada di sini", () => {
    const draft = buildOpeningDraft([account({ code: "9999", closing: 100 })], resolve, null);
    expect(draft.rows[0]).toMatchObject({ side: null, status: "unknown_account" });
    expect(draft.unknownCodes).toEqual(["9999"]);
    expect(draft.totals).toEqual({ debit: 0, credit: 0, equityPlug: 0 });
  });

  it("saldo nol tidak menghasilkan baris saldo awal", () => {
    const draft = buildOpeningDraft([account({ code: "1101", closing: 0 })], resolve, null);
    expect(draft.rows[0].status).toBe("zero");
    expect(draft.totals.debit).toBe(0);
  });
});

describe("impor Daftar Akun dari ekspor LAPORAN Accurate", () => {
  const banner = (text: string) => Array.from({ length: 6 }, () => text);
  /** Laporan Akun Perkiraan: judul kolomnya bergaya laporan, tipenya berupa KATA. */
  const coaReport = (): unknown[][] => [
    banner("PT CONTOH ANUGERAH"),
    banner("Daftar Akun Perkiraan"),
    ["Kode Perkiraan", "Nama Perkiraan", "Tipe Akun", "Mata Uang"],
    ["1101001", "KAS KECIL", "Kas/Bank", "IDR"],
    ["110201", "PIUTANG USAHA", "Piutang Usaha", "IDR"],
    [],
    banner("ACCURATE Accounting System Report"),
    banner("Halaman 1"),
  ];

  it("meratakan laporan lalu memetakan tipe dari NAMANYA, bukan hanya kodenya", () => {
    const flat = flattenAccurateReport(coaReport())!;
    const { accounts, errors } = parseCoaRows(flat.rows, { rowNumbers: flat.rowNumbers });
    expect(errors).toEqual([]);
    expect(accounts).toEqual([
      { code: "1101001", name: "KAS KECIL", type: "cash_bank", normalBalance: "debit", currency: "IDR" },
      {
        code: "110201",
        name: "PIUTANG USAHA",
        type: "account_receivable",
        normalBalance: "debit",
        currency: "IDR",
      },
    ]);
  });

  it("galat menyebut nomor baris ASLI di Excel, bukan nomor hasil perataan", () => {
    const sheet = coaReport();
    sheet[4] = ["", "PIUTANG USAHA", "Piutang Usaha", "IDR"]; // baris ke-5 Excel
    const flat = flattenAccurateReport(sheet)!;
    const { errors } = parseCoaRows(flat.rows, { rowNumbers: flat.rowNumbers });
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(5);
  });

  it("kode empat huruf gaya templat tetap berlaku", () => {
    const { accounts } = parseCoaRows([
      ["Kode", "Nama", "Tipe"],
      ["1101001", "Kas Kecil", "BANK"],
    ]);
    expect(accounts[0].type).toBe("cash_bank");
  });
});

describe("readFirstSheetRows", () => {
  it("membaca sel bertipe TANGGAL sebagai ISO, bukan sebagai teks Date JavaScript", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Tanggal", "Nama"]);
    ws.addRow([new Date(Date.UTC(2024, 11, 31)), "Saldo awal"]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const rows = await readFirstSheetRows(buffer);
    const value = rows[1][0];
    expect(value).toBe("2024-12-31");
    // dan yang penting: importer bisa membacanya
    expect(parseImportDate(String(value))?.toISOString().slice(0, 10)).toBe("2024-12-31");
  });
});
