/**
 * Rekonsiliasi buku besar Accurate ↔ buku sendiri — inti murni (tahap 3).
 *
 * ══ KENAPA MENCOCOKKAN, DAN BUKAN MENGIMPOR ════════════════════════════════
 * Rincian buku besar Accurate hanya memuat satu sisi tiap transaksi (lihat
 * kepala `@/lib/accurate/ledger-report`), jadi ia tidak bisa menjadi jurnal.
 * Yang bisa dilakukan dengannya justru yang paling dibutuhkan saat sebuah PT
 * menjalankan dua sistem berdampingan: MEMBUKTIKAN kedua buku mengatakan hal
 * yang sama, dan menunjuk persis di baris mana keduanya berpisah.
 *
 * ══ TIGA LAPIS PENCOCOKAN, DARI YANG PALING KUAT ═══════════════════════════
 *  1. `exact`            tanggal + nominal + nomor referensinya muncul di
 *                        nomor jurnal atau memo baris kita.
 *  2. `amount_date`      tanggal + nominal sama, referensinya tidak terbaca
 *                        di sisi kita. Hampir selalu benar, tapi lebih lemah:
 *                        dua faktur bernominal sama di hari yang sama bisa
 *                        tertukar satu sama lain — dan itu tidak mengubah
 *                        satu angka pun, jadi konsekuensinya nihil.
 *  3. `reference_only`   nominal + referensi sama, TANGGALNYA berbeda. Ini
 *                        temuan, bukan sekadar kecocokan: transaksi yang sama
 *                        dibukukan di dua tanggal berbeda menggeser laba dua
 *                        periode sekaligus. Karena itu ia dicocokkan (supaya
 *                        tidak dihitung dua kali sebagai "hanya ada di satu
 *                        sisi") tetapi tetap membawa selisih tanggalnya.
 *
 * Yang TIDAK dilakukan: mencocokkan berdasarkan nominal saja. Di buku beban
 * asuransi ekspor mana pun ada puluhan baris bernominal mirip, dan pasangan
 * yang salah menyembunyikan justru transaksi yang hilang.
 *
 * ══ SELISIH ADALAH `sai − accurate` ════════════════════════════════════════
 * Satu arah, disebut sekali di sini, supaya tanda plus/minus di layar tidak
 * pernah perlu ditebak: POSITIF berarti buku kita lebih besar.
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */
import type {
  AccurateLedgerAccount,
  AccurateLedgerEntry,
  AccurateLedgerWarning,
} from "@/lib/accurate/ledger-report";
import type { AccurateReportMeta } from "@/lib/accurate/report-sheet";

/**
 * Satu baris buku besar SISI KITA.
 *
 * Sengaja bentuk lokal, bukan tipe dari `@/lib/ledger`: modul itu mengimpor
 * Prisma, dan inti yang murni tidak boleh menyeretnya masuk hanya demi sebuah
 * tipe. Pemanggilnya yang menjembatani — satu `.map()` di route.
 */
export interface SaiLedgerRow {
  lineId: number;
  journalId: number;
  /** Nomor jurnal ("JV.2025.01.00001"). */
  number: string;
  date: Date;
  memo: string;
  debit: number;
  credit: number;
}

export interface SaiLedgerSide {
  accountId: number;
  code: string;
  name: string;
  opening: number;
  closing: number;
  totalDebit: number;
  totalCredit: number;
  rows: SaiLedgerRow[];
}

export type MatchKind = "exact" | "amount_date" | "reference_only";

export interface EntryMatch {
  kind: MatchKind;
  accurate: AccurateLedgerEntry;
  sai: SaiLedgerRow;
  /** Selisih hari `sai − accurate`; nol untuk dua lapis pertama. */
  dayShift: number;
}

export type AccountStatus =
  /** Saldo awal, mutasi, dan saldo akhir cocok semuanya. */
  | "balanced"
  /** Akunnya ada di kedua sisi, tapi ada angka yang berbeda. */
  | "difference"
  /** Kode akunnya tidak ada di bagan akun kita. */
  | "missing_in_sai";

export interface ReconciliationAmounts {
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

export interface AccountReconciliation {
  code: string;
  name: string;
  status: AccountStatus;
  accurate: ReconciliationAmounts & { entries: number };
  sai: (ReconciliationAmounts & { entries: number; accountId: number }) | null;
  /** `sai − accurate`; nol di semua medan berarti bukunya sepakat. */
  difference: ReconciliationAmounts;
  matches: EntryMatch[];
  onlyInAccurate: AccurateLedgerEntry[];
  onlyInSai: SaiLedgerRow[];
  /** Peringatan dari pembacaan berkasnya, dibawa serta agar terlihat bersama. */
  warnings: AccurateLedgerWarning[];
}

export interface LedgerReconciliation {
  meta: AccurateReportMeta;
  accounts: AccountReconciliation[];
  summary: {
    accounts: number;
    balanced: number;
    withDifference: number;
    missingInSai: number;
    matched: number;
    onlyInAccurate: number;
    onlyInSai: number;
    /** Jumlah kecocokan yang tanggalnya bergeser — layak dilihat sendiri. */
    dateShifted: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPSILON = 0.005;
const differs = (a: number, b: number) => Math.abs(a - b) > EPSILON;

const DAY = 24 * 60 * 60 * 1000;
const dayNumber = (d: Date) => Math.floor(d.getTime() / DAY);

/** Nomor referensi Accurate, dibanding tanpa spasi & besar-kecil huruf. */
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * `true` bila referensi Accurate terbaca di baris kita.
 *
 * Dicari di nomor jurnal DAN di memo, sebab jalur masuknya bisa dua: dokumen
 * yang diimpor menyimpan nomor asalnya di memo, sedangkan jurnal yang diketik
 * tangan kadang memakainya sebagai nomor. Referensi yang lebih pendek dari
 * empat huruf diabaikan — "1" akan cocok dengan hampir semua nomor jurnal, dan
 * kecocokan yang selalu benar tidak membedakan apa pun.
 */
function referenceMatches(entry: AccurateLedgerEntry, row: SaiLedgerRow): boolean {
  const candidates = [entry.reference, entry.description]
    .map(squash)
    .filter((c) => c.length >= 4);
  if (candidates.length === 0) return false;
  const haystack = squash(`${row.number} ${row.memo}`);
  return candidates.some((c) => haystack.includes(c));
}

const sameAmounts = (entry: AccurateLedgerEntry, row: SaiLedgerRow) =>
  !differs(entry.debit, row.debit) && !differs(entry.credit, row.credit);

/**
 * Cocokkan entri satu akun, tiga lapis, dari yang paling kuat.
 *
 * Setiap baris hanya boleh terpakai sekali di kedua sisi — tanpa itu, satu
 * baris kita bisa "memuaskan" tiga baris Accurate sekaligus dan laporannya
 * akan menyatakan bukunya cocok justru ketika dua transaksi hilang.
 */
export function matchEntries(
  entries: readonly AccurateLedgerEntry[],
  rows: readonly SaiLedgerRow[]
): { matches: EntryMatch[]; onlyInAccurate: AccurateLedgerEntry[]; onlyInSai: SaiLedgerRow[] } {
  const matches: EntryMatch[] = [];
  const usedSai = new Set<number>();
  const usedAccurate = new Set<number>();

  const pass = (
    kind: MatchKind,
    fits: (entry: AccurateLedgerEntry, row: SaiLedgerRow) => boolean
  ) => {
    entries.forEach((entry, i) => {
      if (usedAccurate.has(i)) return;
      for (let j = 0; j < rows.length; j += 1) {
        if (usedSai.has(j)) continue;
        const row = rows[j];
        if (!fits(entry, row)) continue;
        usedAccurate.add(i);
        usedSai.add(j);
        matches.push({
          kind,
          accurate: entry,
          sai: row,
          dayShift: dayNumber(row.date) - dayNumber(entry.date),
        });
        return;
      }
    });
  };

  const sameDay = (entry: AccurateLedgerEntry, row: SaiLedgerRow) =>
    dayNumber(entry.date) === dayNumber(row.date);

  pass("exact", (e, r) => sameDay(e, r) && sameAmounts(e, r) && referenceMatches(e, r));
  pass("amount_date", (e, r) => sameDay(e, r) && sameAmounts(e, r));
  pass("reference_only", (e, r) => sameAmounts(e, r) && referenceMatches(e, r));

  return {
    matches,
    onlyInAccurate: entries.filter((_, i) => !usedAccurate.has(i)),
    onlyInSai: rows.filter((_, j) => !usedSai.has(j)),
  };
}

/** Cocokkan satu akun Accurate dengan sisi kita (`null` = akunnya tak ada). */
export function reconcileAccount(
  accurate: AccurateLedgerAccount,
  sai: SaiLedgerSide | null
): AccountReconciliation {
  const accurateAmounts = {
    opening: round2(accurate.opening),
    debit: accurate.sumDebit,
    credit: accurate.sumCredit,
    closing: accurate.closing,
    entries: accurate.entries.length,
  };

  if (!sai) {
    return {
      code: accurate.code,
      name: accurate.name,
      status: "missing_in_sai",
      accurate: accurateAmounts,
      sai: null,
      difference: {
        opening: -accurateAmounts.opening,
        debit: -accurateAmounts.debit,
        credit: -accurateAmounts.credit,
        closing: -accurateAmounts.closing,
      },
      matches: [],
      onlyInAccurate: [...accurate.entries],
      onlyInSai: [],
      warnings: accurate.warnings,
    };
  }

  const { matches, onlyInAccurate, onlyInSai } = matchEntries(accurate.entries, sai.rows);

  const difference = {
    opening: round2(sai.opening - accurateAmounts.opening),
    debit: round2(sai.totalDebit - accurateAmounts.debit),
    credit: round2(sai.totalCredit - accurateAmounts.credit),
    closing: round2(sai.closing - accurateAmounts.closing),
  };

  /* "Cocok" diputuskan dari ANGKANYA, bukan dari jumlah pasangan yang berhasil
     dibentuk. Dua buku bisa sepakat sempurna sementara pencocokan baris demi
     baris gagal karena satu transaksi kita tergabung jadi satu jurnal — dan
     menyebut itu "selisih" akan mengirim orang mencari uang yang tidak hilang. */
  const status: AccountStatus =
    difference.opening === 0 &&
    difference.debit === 0 &&
    difference.credit === 0 &&
    difference.closing === 0
      ? "balanced"
      : "difference";

  return {
    code: accurate.code,
    name: accurate.name,
    status,
    accurate: accurateAmounts,
    sai: {
      accountId: sai.accountId,
      opening: round2(sai.opening),
      debit: round2(sai.totalDebit),
      credit: round2(sai.totalCredit),
      closing: round2(sai.closing),
      entries: sai.rows.length,
    },
    difference,
    matches,
    onlyInAccurate,
    onlyInSai,
    warnings: accurate.warnings,
  };
}

/**
 * Rekonsiliasi seluruh laporan.
 *
 * `sides` dipetakan menurut KODE akun. Kode adalah satu-satunya penghubung
 * yang dimiliki kedua sistem: id internal jelas berbeda, dan nama akun sudah
 * pasti pernah disunting salah satu pihak.
 */
export function reconcileLedgerReport(
  meta: AccurateReportMeta,
  accounts: readonly AccurateLedgerAccount[],
  sides: ReadonlyMap<string, SaiLedgerSide>
): LedgerReconciliation {
  const results = accounts.map((account) =>
    reconcileAccount(account, sides.get(account.code) ?? null)
  );

  return {
    meta,
    accounts: results,
    summary: {
      accounts: results.length,
      balanced: results.filter((r) => r.status === "balanced").length,
      withDifference: results.filter((r) => r.status === "difference").length,
      missingInSai: results.filter((r) => r.status === "missing_in_sai").length,
      matched: results.reduce((n, r) => n + r.matches.length, 0),
      onlyInAccurate: results.reduce((n, r) => n + r.onlyInAccurate.length, 0),
      onlyInSai: results.reduce((n, r) => n + r.onlyInSai.length, 0),
      dateShifted: results.reduce(
        (n, r) => n + r.matches.filter((m) => m.dayShift !== 0).length,
        0
      ),
    },
  };
}
