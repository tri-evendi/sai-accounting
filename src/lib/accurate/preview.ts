/**
 * Bentuk MUATAN pratinjau integrasi Accurate — inti murni (tahap 6).
 *
 * Satu bentuk yang dipakai DUA sisi: route menyusunnya, halaman membacanya.
 * Sengaja bukan tipe internal (`AccountReconciliation`, `AccurateLedgerEntry`)
 * yang dikirim apa adanya — dua alasan, keduanya sudah pernah menggigit repo
 * lain:
 *
 *  • `Date` tidak selamat melewati JSON. Dikirim mentah ia tiba sebagai string
 *    yang bertipe `Date` menurut TypeScript, dan `.getTime()` pertama di klien
 *    meledak pada runtime sementara `tsc` diam. Di sini tanggal BERTIPE string
 *    ISO, jadi kompilernya ikut menjaga.
 *  • Daftar transaksi bisa panjang. Yang dikirim DIPOTONG di sini, satu tempat,
 *    dengan penanda `truncated` yang harus ditampilkan — pemotongan senyap
 *    membuat "hanya 100 selisih" terbaca sebagai seluruh kebenaran.
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */
import type { AccurateLedgerEntry, AccurateLedgerWarning } from "@/lib/accurate/ledger-report";
import type { AccurateRepair, AccurateReportMeta } from "@/lib/accurate/report-sheet";
import type {
  AccountReconciliation,
  LedgerReconciliation,
  MatchKind,
  SaiLedgerRow,
} from "@/lib/accurate/reconcile";
import type { OpeningDraft, OpeningDraftRow } from "@/lib/accurate/opening-draft";

/**
 * Batas baris rincian yang dikirim per akun per daftar.
 *
 * Cukup besar untuk memuat seluruh selisih yang wajar, cukup kecil untuk
 * menjaga jawabannya tetap bisa dirender. Yang melewatinya tetap DIHITUNG di
 * `counts` — jadi angkanya selalu utuh sekalipun daftarnya tidak.
 */
export const PREVIEW_DETAIL_LIMIT = 100;

export interface PreviewEntry {
  row: number;
  /** Tanggal ISO `YYYY-MM-DD`. */
  date: string;
  transactionType: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
}

export interface PreviewSaiRow {
  lineId: number;
  journalId: number;
  number: string;
  date: string;
  memo: string;
  debit: number;
  credit: number;
}

export interface PreviewMatch {
  kind: MatchKind;
  dayShift: number;
  accurate: PreviewEntry;
  sai: PreviewSaiRow;
}

export interface PreviewAmounts {
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

export interface PreviewAccount {
  code: string;
  name: string;
  status: AccountReconciliation["status"];
  accurate: PreviewAmounts & { entries: number };
  sai: (PreviewAmounts & { entries: number; accountId: number }) | null;
  difference: PreviewAmounts;
  counts: {
    matched: number;
    exact: number;
    amountDate: number;
    referenceOnly: number;
    dateShifted: number;
    onlyInAccurate: number;
    onlyInSai: number;
  };
  /** Dipotong pada `PREVIEW_DETAIL_LIMIT`; lihat `truncated`. */
  onlyInAccurate: PreviewEntry[];
  onlyInSai: PreviewSaiRow[];
  /** Kecocokan yang tanggalnya bergeser — hanya itu yang perlu dilihat orang. */
  dateShifted: PreviewMatch[];
  truncated: boolean;
  warnings: AccurateLedgerWarning[];
}

/** Baris rancangan saldo awal — sudah bebas `Date`, jadi lolos JSON apa adanya. */
export type PreviewDraftRow = OpeningDraftRow;

export interface AccuratePreview {
  meta: AccurateReportMeta;
  /** Rentang laporan, dibaca dari kepala laporannya sendiri. */
  period: { from: string; to: string } | null;
  summary: LedgerReconciliation["summary"];
  accounts: PreviewAccount[];
  /** Sambungan sel terpotong ganti halaman & potongan yatim. */
  repairs: AccurateRepair[];
  draft: {
    asOf: string | null;
    rows: PreviewDraftRow[];
    totals: OpeningDraft["totals"];
    unknownCodes: string[];
  };
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

const toEntry = (e: AccurateLedgerEntry): PreviewEntry => ({
  row: e.row,
  date: iso(e.date),
  transactionType: e.transactionType,
  description: e.description,
  reference: e.reference,
  debit: e.debit,
  credit: e.credit,
});

const toSaiRow = (r: SaiLedgerRow): PreviewSaiRow => ({
  lineId: r.lineId,
  journalId: r.journalId,
  number: r.number,
  date: iso(r.date),
  memo: r.memo,
  debit: r.debit,
  credit: r.credit,
});

function toAccount(account: AccountReconciliation): PreviewAccount {
  const kind = (k: MatchKind) => account.matches.filter((m) => m.kind === k).length;
  const shifted = account.matches.filter((m) => m.dayShift !== 0);

  return {
    code: account.code,
    name: account.name,
    status: account.status,
    accurate: account.accurate,
    sai: account.sai,
    difference: account.difference,
    counts: {
      matched: account.matches.length,
      exact: kind("exact"),
      amountDate: kind("amount_date"),
      referenceOnly: kind("reference_only"),
      dateShifted: shifted.length,
      onlyInAccurate: account.onlyInAccurate.length,
      onlyInSai: account.onlyInSai.length,
    },
    onlyInAccurate: account.onlyInAccurate.slice(0, PREVIEW_DETAIL_LIMIT).map(toEntry),
    onlyInSai: account.onlyInSai.slice(0, PREVIEW_DETAIL_LIMIT).map(toSaiRow),
    dateShifted: shifted.slice(0, PREVIEW_DETAIL_LIMIT).map((m) => ({
      kind: m.kind,
      dayShift: m.dayShift,
      accurate: toEntry(m.accurate),
      sai: toSaiRow(m.sai),
    })),
    truncated:
      account.onlyInAccurate.length > PREVIEW_DETAIL_LIMIT ||
      account.onlyInSai.length > PREVIEW_DETAIL_LIMIT ||
      shifted.length > PREVIEW_DETAIL_LIMIT,
    warnings: account.warnings,
  };
}

export function buildAccuratePreview(
  reconciliation: LedgerReconciliation,
  repairs: readonly AccurateRepair[],
  draft: OpeningDraft,
  period: { from: Date; to: Date } | null
): AccuratePreview {
  return {
    meta: reconciliation.meta,
    period: period ? { from: iso(period.from), to: iso(period.to) } : null,
    summary: reconciliation.summary,
    accounts: reconciliation.accounts.map(toAccount),
    repairs: [...repairs],
    draft: {
      asOf: draft.asOf ? iso(draft.asOf) : null,
      rows: draft.rows,
      totals: draft.totals,
      unknownCodes: draft.unknownCodes,
    },
  };
}
