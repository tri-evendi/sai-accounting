/**
 * Parser "Rincian Buku Besar" Accurate — inti murni (integrasi Accurate, tahap 2).
 *
 * Menerima laporan yang sudah dinormalkan `@/lib/accurate/report-sheet` dan
 * mengubahnya menjadi seksi per akun: kode & nama, saldo awal, daftar
 * transaksi, total, saldo akhir.
 *
 * ══ SATU HAL YANG HARUS DIKETAHUI SEBELUM MEMAKAI HASILNYA ═════════════════
 * Rincian buku besar hanya memuat SATU SISI setiap transaksi — sisi akun yang
 * sedang dicetak. Lawan akunnya tidak ada di berkas, dan tidak bisa
 * disimpulkan dari apa pun di dalamnya.
 *
 * Karena itu hasil modul ini TIDAK PERNAH boleh diposting sebagai jurnal.
 * Jurnal berpasangan yang lawannya ditebak bukan pembukuan, dan aplikasi ini
 * menolak jurnal timpang di `postJournal` — jadi tebakan itu akan berubah
 * menjadi galat yang jauh dari sebabnya. Yang SAH dilakukan dengan hasil ini:
 * mencocokkan (rekonsiliasi), memeriksa, dan menarik saldo. Ketiganya ada di
 * `@/lib/accurate/reconcile` dan `@/lib/accurate/opening-draft`.
 *
 * ══ YANG DIPERIKSA, DAN KENAPA ═════════════════════════════════════════════
 * Accurate mencetak saldo berjalan dan total di berkasnya sendiri. Keduanya
 * dihitung ULANG di sini lalu dibandingkan. Kalau berbeda, yang terjadi bukan
 * "laporan Accurate salah" melainkan "berkas ini tidak utuh" — halaman yang
 * hilang saat disalin, baris yang tersunting tangan di Excel, atau kolom yang
 * salah dipetakan. Ketiganya wajib terlihat SEBELUM angkanya dipakai untuk
 * mencocokkan buku, sebab selisih yang lahir dari berkas rusak akan dikira
 * selisih pembukuan dan diperbaiki di tempat yang salah.
 *
 * MURNI: tanpa Prisma, tanpa ExcelJS, tanpa I/O.
 */
import { mapHeaderRow, type ColumnSpec } from "@/lib/import/spec";
import { parseAmount, parseImportDate } from "@/lib/import/fields";
import {
  readAccurateReport,
  type AccurateReportMeta,
  type AccurateRepair,
} from "@/lib/accurate/report-sheet";

/** Kolom laporan rincian buku besar, beserta nama-nama lain yang ikut diterima. */
export const LEDGER_COLUMNS: readonly ColumnSpec[] = [
  { key: "date", header: "Tanggal", aliases: ["Date", "Tgl"], required: true },
  {
    key: "transactionType",
    header: "Tipe Transaksi",
    aliases: ["Transaction Type", "Tipe", "Sumber"],
  },
  {
    key: "description",
    header: "Keterangan",
    aliases: ["Description", "Deskripsi", "Memo"],
    required: true,
  },
  { key: "debit", header: "Debit", aliases: ["Debet"], required: true },
  { key: "credit", header: "Kredit", aliases: ["Credit"], required: true },
  {
    key: "balance",
    header: "Saldo Akhir",
    aliases: ["Saldo", "Balance", "Ending Balance", "Saldo Berjalan"],
  },
];

/** Keterangan baris pembuka sebuah seksi akun ("Saldo per 31 Dec 2024"). */
const OPENING_MARKER = /^saldo\s+(per|awal)\b/i;

export interface AccurateLedgerEntry {
  /** Nomor baris di Excel — supaya setiap temuan bisa ditunjuk di berkasnya. */
  row: number;
  date: Date;
  /** "Faktur Pembelian", "Jurnal Umum", … apa adanya dari Accurate. */
  transactionType: string;
  /** Baris PERTAMA kolom Keterangan — nomor dokumennya. */
  description: string;
  /**
   * Baris berikutnya kolom Keterangan — nomor referensi internal ("SAI 00100").
   * Kosong berarti Accurate memang tidak mencetaknya untuk baris itu.
   */
  reference: string;
  debit: number;
  credit: number;
  /** Saldo berjalan yang DICETAK Accurate; `null` bila kolomnya tidak ada. */
  printedBalance: number | null;
}

export type AccurateLedgerWarningKind =
  | "running_balance_mismatch"
  | "total_mismatch"
  | "closing_mismatch"
  | "duplicate_reference"
  | "missing_reference"
  | "no_account_header"
  | "unreadable_row";

export interface AccurateLedgerWarning {
  kind: AccurateLedgerWarningKind;
  /** Baris di Excel yang memicunya; `null` bila menyangkut seksi seutuhnya. */
  row: number | null;
  message: string;
}

export interface AccurateLedgerAccount {
  /** Kode akun Accurate ("5100006004"). */
  code: string;
  /** Nama akun apa adanya, spasi gandanya sudah dirapikan. */
  name: string;
  /** Tanggal baris saldo awal, bila laporannya mencetaknya. */
  openingDate: Date | null;
  /** Saldo awal menurut laporan. Nol bila tidak dicetak. */
  opening: number;
  entries: AccurateLedgerEntry[];
  /** Jumlah debit/kredit yang DIHITUNG dari entrinya. */
  sumDebit: number;
  sumCredit: number;
  /** Total yang DICETAK Accurate di kaki seksi; `null` bila tidak ada. */
  printedTotalDebit: number | null;
  printedTotalCredit: number | null;
  /** Saldo akhir = saldo awal + mutasi, dihitung ulang. */
  closing: number;
  /** Saldo akhir menurut angka terakhir yang dicetak Accurate. */
  printedClosing: number | null;
  warnings: AccurateLedgerWarning[];
}

export interface AccurateLedgerReport {
  meta: AccurateReportMeta;
  accounts: AccurateLedgerAccount[];
  /** Sambungan sel terpotong & potongan yatim dari pembaca laporan. */
  repairs: AccurateRepair[];
  /** Kolom wajib yang tidak ditemukan — terisi berarti berkasnya salah jenis. */
  missingColumns: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Ambang beda yang masih dianggap sama — satu sen. */
const EPSILON = 0.005;
const differs = (a: number, b: number) => Math.abs(a - b) > EPSILON;

const text = (cell: unknown): string => (cell == null ? "" : String(cell).trim());

/** Nominal dari sel; sel kosong berarti nol, bukan "tidak terbaca". */
function amount(cell: unknown): number | null {
  const raw = text(cell);
  if (raw === "") return 0;
  return parseAmount(raw);
}

/**
 * Pecah kolom Keterangan menjadi nomor dokumen dan nomor referensi.
 *
 * Accurate menaruh keduanya dalam SATU sel, dipisah pergantian baris. Baris
 * pertama nomor dokumennya; sisanya referensi internal. Sel yang hanya punya
 * satu baris berarti referensinya memang tidak dicetak — bukan hilang.
 */
export function splitLedgerDescription(raw: string): { description: string; reference: string } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return {
    description: lines[0] ?? "",
    reference: lines.slice(1).join(" "),
  };
}

/** Kepala seksi "5100006004 - BIAYA ASURANSI  EKSPORT" → kode + nama. */
function parseSectionHeading(heading: string): { code: string; name: string } | null {
  const m = /^(.+?)\s+-\s+(.+)$/.exec(heading);
  if (!m) return null;
  return { code: m[1].trim(), name: m[2].replace(/\s+/g, " ").trim() };
}

interface Draft {
  code: string;
  name: string;
  openingDate: Date | null;
  opening: number;
  openingSeen: boolean;
  entries: AccurateLedgerEntry[];
  printedTotalDebit: number | null;
  printedTotalCredit: number | null;
  warnings: AccurateLedgerWarning[];
}

const newDraft = (code: string, name: string): Draft => ({
  code,
  name,
  openingDate: null,
  opening: 0,
  openingSeen: false,
  entries: [],
  printedTotalDebit: null,
  printedTotalCredit: null,
  warnings: [],
});

/**
 * Baca sheet ekspor "Rincian Buku Besar" Accurate.
 *
 * Mengembalikan `null` bila sheet-nya bukan laporan Accurate sama sekali —
 * pemanggil bertanggung jawab memberi pesan yang menyebut jenis berkas yang
 * diharapkan, sebab hanya dia yang tahu dari layar mana berkas itu datang.
 */
export function parseAccurateLedgerReport(sheet: unknown[][]): AccurateLedgerReport | null {
  const report = readAccurateReport(sheet);
  if (!report) return null;

  const { index, missing } = mapHeaderRow(report.header, LEDGER_COLUMNS);
  if (missing.length > 0) {
    return { meta: report.meta, accounts: [], repairs: report.repairs, missingColumns: missing };
  }

  const at = (cells: unknown[], key: string): unknown => {
    const i = index[key];
    return i === undefined ? "" : cells[i];
  };

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  /* Kepala seksi Accurate datang DUA baris: kodenya sendiri, lalu
     "kode - nama". Baris pertama ditahan di sini sampai pasangannya tiba. */
  let pendingCode: string | null = null;

  const ensure = (row: number): Draft => {
    if (current) return current;
    /* Laporan yang disaring ke satu akun kadang tidak mencetak kepala seksi
       sama sekali. Datanya tetap sah; yang tidak diketahui hanya MILIK SIAPA —
       dan itu harus dikatakan, bukan diisi dengan tebakan dari nama berkas. */
    current = newDraft("", "");
    current.warnings.push({
      kind: "no_account_header",
      row,
      message:
        "Baris transaksi ditemukan sebelum ada kepala seksi akun — kode akunnya tidak diketahui.",
    });
    drafts.push(current);
    return current;
  };

  for (const row of report.rows) {
    if (row.kind === "section") {
      const parsed = parseSectionHeading(row.text);
      if (parsed) {
        // "kode - nama" yang melanjutkan baris kode di atasnya = SATU akun.
        if (pendingCode !== null && pendingCode === parsed.code) pendingCode = null;
        current = newDraft(parsed.code, parsed.name);
        drafts.push(current);
        continue;
      }
      pendingCode = row.text.trim();
      continue;
    }

    const dateRaw = text(at(row.cells, "date"));
    const descriptionRaw = text(at(row.cells, "description"));
    const debit = amount(at(row.cells, "debit"));
    const credit = amount(at(row.cells, "credit"));
    const balanceRaw = text(at(row.cells, "balance"));
    const printedBalance = balanceRaw === "" ? null : parseAmount(balanceRaw);

    // Baris SALDO AWAL — bertanggal, berketerangan "Saldo per …", tanpa mutasi.
    if (OPENING_MARKER.test(descriptionRaw)) {
      const draft = ensure(row.row);
      draft.openingSeen = true;
      draft.openingDate = parseImportDate(dateRaw);
      draft.opening = printedBalance ?? 0;
      continue;
    }

    // Baris TOTAL — tanpa tanggal & tanpa keterangan, tapi bernominal.
    if (dateRaw === "" && descriptionRaw === "") {
      if (debit === null && credit === null) continue;
      const draft = ensure(row.row);
      const d = debit ?? 0;
      const c = credit ?? 0;
      /* Accurate mencetak total seksi lalu total laporan; untuk laporan satu
         akun keduanya identik dan pengulangannya bukan informasi. Yang BERBEDA
         justru harus terdengar. */
      if (draft.printedTotalDebit === null) {
        draft.printedTotalDebit = d;
        draft.printedTotalCredit = c;
      } else if (differs(draft.printedTotalDebit, d) || differs(draft.printedTotalCredit ?? 0, c)) {
        draft.warnings.push({
          kind: "total_mismatch",
          row: row.row,
          message: `Laporan mencetak dua baris total yang berbeda (${draft.printedTotalDebit} / ${d}).`,
        });
      }
      continue;
    }

    const date = parseImportDate(dateRaw);
    if (!date || debit === null || credit === null) {
      const draft = ensure(row.row);
      draft.warnings.push({
        kind: "unreadable_row",
        row: row.row,
        message: !date
          ? `Tanggal "${dateRaw}" tidak terbaca — baris ini dilewati.`
          : `Nominal debit/kredit tidak terbaca — baris ini dilewati.`,
      });
      continue;
    }

    const { description, reference } = splitLedgerDescription(descriptionRaw);
    const draft = ensure(row.row);
    draft.entries.push({
      row: row.row,
      date,
      transactionType: text(at(row.cells, "transactionType")),
      description,
      reference,
      debit,
      credit,
      printedBalance,
    });
  }

  const accounts = drafts.map((draft) => finish(draft));
  return { meta: report.meta, accounts, repairs: report.repairs, missingColumns: [] };
}

/**
 * Hitung ulang saldo & total sebuah seksi, lalu bandingkan dengan yang dicetak.
 *
 * Arah saldo berjalan sengaja diambil dari LAPORANNYA, bukan dari tipe akun:
 * berkas ini tidak menyebut tipe akun sama sekali, dan menebaknya dari nomor
 * akun berarti menanam bagan akun Accurate ke dalam kode. Yang dilakukan:
 * mengikuti tanda yang dipakai Accurate sendiri di baris pertamanya (debit
 * menaikkan atau menurunkan), sehingga akun bersaldo normal kredit pun terbaca
 * benar.
 */
function finish(draft: Draft): AccurateLedgerAccount {
  const sign = runningSign(draft);

  let sumDebit = 0;
  let sumCredit = 0;
  let balance = draft.opening;
  const warnings = [...draft.warnings];

  for (const entry of draft.entries) {
    sumDebit += entry.debit;
    sumCredit += entry.credit;
    balance = round2(balance + sign * (entry.debit - entry.credit));
    if (entry.printedBalance !== null && differs(balance, entry.printedBalance)) {
      warnings.push({
        kind: "running_balance_mismatch",
        row: entry.row,
        message:
          `Saldo berjalan tidak cocok: laporan mencetak ${entry.printedBalance}, ` +
          `hitungan dari baris-baris di atasnya ${balance}.`,
      });
    }
    if (entry.reference === "") {
      warnings.push({
        kind: "missing_reference",
        row: entry.row,
        message: `Baris "${entry.description}" tidak punya nomor referensi.`,
      });
    }
  }

  sumDebit = round2(sumDebit);
  sumCredit = round2(sumCredit);

  if (draft.printedTotalDebit !== null && differs(draft.printedTotalDebit, sumDebit)) {
    warnings.push({
      kind: "total_mismatch",
      row: null,
      message: `Total debit laporan ${draft.printedTotalDebit} ≠ jumlah barisnya ${sumDebit}.`,
    });
  }
  if (draft.printedTotalCredit !== null && differs(draft.printedTotalCredit, sumCredit)) {
    warnings.push({
      kind: "total_mismatch",
      row: null,
      message: `Total kredit laporan ${draft.printedTotalCredit} ≠ jumlah barisnya ${sumCredit}.`,
    });
  }

  const last = draft.entries[draft.entries.length - 1];
  const printedClosing = last?.printedBalance ?? (draft.openingSeen ? draft.opening : null);
  if (printedClosing !== null && differs(printedClosing, balance)) {
    warnings.push({
      kind: "closing_mismatch",
      row: null,
      message: `Saldo akhir laporan ${printedClosing} ≠ hitungan ulang ${balance}.`,
    });
  }

  warnings.push(...duplicateWarnings(draft.entries));

  return {
    code: draft.code,
    name: draft.name,
    openingDate: draft.openingDate,
    opening: draft.opening,
    entries: draft.entries,
    sumDebit,
    sumCredit,
    printedTotalDebit: draft.printedTotalDebit,
    printedTotalCredit: draft.printedTotalCredit,
    closing: balance,
    printedClosing,
    warnings,
  };
}

/**
 * Arah saldo berjalan menurut laporannya sendiri (+1 atau −1).
 *
 * Dibaca dari entri PERTAMA yang punya saldo tercetak dan mutasi bukan nol:
 * bila saldo naik saat debit, akunnya bersaldo normal debit. Bila tak ada
 * petunjuk sama sekali, +1 — sama dengan asumsi lama, dan selisihnya akan
 * terdengar sebagai `running_balance_mismatch` alih-alih diam.
 */
function runningSign(draft: Draft): 1 | -1 {
  /* `const`: keputusannya diambil dari entri PERTAMA yang memberi petunjuk,
     lalu langsung dipulangkan — jadi tak pernah ada saldo kedua yang dihitung. */
  const balance = draft.opening;
  for (const entry of draft.entries) {
    const movement = entry.debit - entry.credit;
    if (movement === 0 || entry.printedBalance === null) continue;
    const asDebit = round2(balance + movement);
    const asCredit = round2(balance - movement);
    if (!differs(asDebit, entry.printedBalance)) return 1;
    if (!differs(asCredit, entry.printedBalance)) return -1;
    return 1;
  }
  return 1;
}

/**
 * Kandidat pembukuan GANDA di dalam berkas Accurate sendiri.
 *
 * Dikenali dari nomor referensi yang SAMA dengan nominal yang SAMA. Itu bukan
 * bukti — satu referensi memang bisa sah menurunkan dua baris — jadi yang
 * diterbitkan peringatan, bukan galat. Tetapi ia harus terlihat: di berkas
 * contoh yang memicu modul ini, `SAI 000069` muncul dua kali dengan nominal
 * identik 468.313 di bawah dua nomor faktur yang berbeda.
 */
function duplicateWarnings(entries: AccurateLedgerEntry[]): AccurateLedgerWarning[] {
  const seen = new Map<string, AccurateLedgerEntry>();
  const out: AccurateLedgerWarning[] = [];
  for (const entry of entries) {
    if (entry.reference === "") continue;
    const key = `${entry.reference}|${entry.debit}|${entry.credit}`;
    const first = seen.get(key);
    if (first) {
      out.push({
        kind: "duplicate_reference",
        row: entry.row,
        message:
          `Referensi "${entry.reference}" dengan nominal yang sama sudah muncul di baris ` +
          `${first.row} ("${first.description}").`,
      });
      continue;
    }
    seen.set(key, entry);
  }
  return out;
}
