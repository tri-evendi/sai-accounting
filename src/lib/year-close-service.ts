/**
 * TUTUP BUKU TAHUNAN (issue #555) — pengumpul saldo dan jalur postingnya.
 *
 * Aritmetikanya dan batas tahun bukunya hidup di `lib/year-close.ts`, diuji
 * tanpa basis data. Yang di sini hanya yang memang butuh Prisma.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { accountCategoryFor } from "@/lib/accounting";
import { postJournal } from "@/lib/ledger";
import { resolveAccountId, MAPPING_KEYS } from "@/lib/posting/mapping";
import {
  CLOSING_JOURNAL_TYPE,
  fiscalYearBounds,
  fiscalYearHasEnded,
  NOT_CLOSING,
  planYearClose,
  type ClosingBalance,
  type YearClosePlan,
} from "@/lib/year-close";

type Client = typeof prisma | Prisma.TransactionClient;

/** Tahun buku ini sudah ditutup dan belum dibatalkan. */
export class AlreadyClosedError extends Error {
  constructor(readonly year: number) {
    super(`Tahun buku ${year} sudah ditutup.`);
    this.name = "AlreadyClosedError";
  }
}

/**
 * Tahun bukunya BELUM berakhir (issue #565).
 *
 * Membawa tanggal berakhirnya, supaya pemanggil bisa mengatakan KAPAN ia boleh
 * ditutup — bukan sekadar bahwa sekarang belum boleh.
 */
export class FiscalYearNotEndedError extends Error {
  constructor(readonly year: number, readonly endsAt: Date) {
    super(`Tahun buku ${year} baru berakhir ${endsAt.toISOString()}.`);
    this.name = "FiscalYearNotEndedError";
  }
}

/** Tidak ada yang bisa ditutup — tahun tanpa satu pun saldo laba rugi. */
export class NothingToCloseError extends Error {
  constructor(readonly year: number) {
    super(`Tahun buku ${year} tidak punya saldo laba rugi untuk ditutup.`);
    this.name = "NothingToCloseError";
  }
}

/** Awal tahun buku perusahaan ini. */
async function fiscalYearStart(client: Client): Promise<Date> {
  const setting = await client.companySetting.findFirst({
    select: { fiscalYearStart: true },
  });
  /*
   * Buku tanpa `company_settings` belum selesai disiapkan. Menebak 1 Januari di
   * sini akan menutup buku pada tanggal yang mungkin salah tanpa satu pun tanda
   * — dan tanggal jurnal penutup menentukan tahun mana yang menerima labanya.
   */
  if (!setting) throw new Error("Awal tahun buku belum disetel.");
  return setting.fiscalYearStart;
}

/**
 * Saldo akun laba rugi sepanjang satu tahun buku, POSITIF-DEBIT.
 *
 * ══ JURNAL PENUTUP DIKECUALIKAN — DAN INI YANG PALING MUDAH TERLEWAT ═══════
 * Tanpa `NOT_CLOSING`, menutup tahun yang PERNAH ditutup lalu dibatalkan akan
 * membaca saldo yang sudah dinolkan penutup lamanya, memulangkan nol, dan
 * "berhasil" tanpa memindahkan apa pun. Aturannya sama dengan yang dipakai
 * Laba Rugi, dan penyaringnya diimpor dari sana — bukan ditulis ulang.
 */
async function profitAndLossBalances(
  year: number,
  client: Client = prisma
): Promise<ClosingBalance[]> {
  const { start, end } = fiscalYearBounds(await fiscalYearStart(client), year);

  const accounts = await client.account.findMany({
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });
  const pnl = accounts.filter((a) => {
    const cat = accountCategoryFor(a.type);
    return cat === "revenue" || cat === "expense";
  });
  if (pnl.length === 0) return [];

  const grouped = await client.journalLine.groupBy({
    by: ["accountId"],
    _sum: { baseDebit: true, baseCredit: true },
    where: {
      accountId: { in: pnl.map((a) => a.id) },
      journal: { date: { gte: start, lte: end }, ...NOT_CLOSING },
    },
  });
  const netById = new Map(
    grouped.map((g) => [
      g.accountId,
      Number(g._sum.baseDebit ?? 0) - Number(g._sum.baseCredit ?? 0),
    ])
  );

  return pnl.map((a) => ({
    accountId: a.id,
    accountCode: a.code,
    accountName: a.name,
    balance: netById.get(a.id) ?? 0,
  }));
}

/** Rencana penutupan — hanya membaca. */
export async function previewYearClose(
  year: number,
  client: Client = prisma
): Promise<YearClosePlan> {
  const [balances, retainedEarningsId] = await Promise.all([
    profitAndLossBalances(year, client),
    resolveAccountId(MAPPING_KEYS.RETAINED_EARNINGS, null, client),
  ]);
  return planYearClose(balances, retainedEarningsId);
}

export interface YearCloseResult {
  id: number;
  year: number;
  plan: YearClosePlan;
  journalId: number;
}

/**
 * Tutup satu tahun buku.
 *
 * ══ TANGGAL JURNALNYA AKHIR TAHUN BUKU, BUKAN HARI INI ═════════════════════
 * Kalau tidak, Laba Rugi tahun itu berubah SESUDAH dilaporkan — dan laporan
 * yang sudah diserahkan ke bank atau kantor pajak tidak lagi bisa dihasilkan
 * ulang dari bukunya sendiri.
 *
 * ══ IDEMPOTENSI DARI CONSTRAINT ════════════════════════════════════════════
 * Baris `year_closes` ditulis di dalam transaksi yang sama; `@@unique([year])`
 * yang menjaganya. Menutup dua kali menggandakan laba di Laba Ditahan dan tetap
 * menghasilkan neraca yang seimbang — kesalahan yang tidak berbunyi.
 */
export async function closeYear(
  year: number,
  userId: number | null,
  client: typeof prisma = prisma
): Promise<YearCloseResult> {
  return client.$transaction(async (tx) => {
    const existing = await tx.yearClose.findUnique({ where: { year } });
    if (existing && existing.reversedAt === null) throw new AlreadyClosedError(year);

    const awal = await fiscalYearStart(tx);
    const { end } = fiscalYearBounds(awal, year);

    /*
     * ── Tahun buku harus SUDAH BERAKHIR (issue #565) ──────────────────────
     * Diperiksa SEBELUM satu baris pun ditulis, dan sebelum rencananya
     * disusun: menutup tahun berjalan menerbitkan jurnal bertanggal masa depan
     * dan meninggalkan sisa tahunnya di luar penutupan — dengan neraca yang
     * tetap seimbang dan tanpa satu galat pun. `assertPeriodOpen` tidak
     * menahannya, sebab bulan Desember memang terbuka.
     */
    if (!fiscalYearHasEnded(awal, year, new Date())) {
      throw new FiscalYearNotEndedError(year, end);
    }

    const plan = await previewYearClose(year, tx);

    /*
     * Tahun tanpa saldo laba rugi DITOLAK, bukan dicatat sebagai penutupan
     * kosong. Baris `year_closes` menyatakan "tahun ini sudah ditutup", dan
     * menyatakannya untuk tahun yang tidak punya apa-apa membuat tahun
     * berikutnya menumpuk di atas penutupan yang tidak pernah memindahkan
     * apa pun.
     */
    if (plan.lines.length === 0) throw new NothingToCloseError(year);

    const journal = await postJournal(
      {
        date: end,
        type: CLOSING_JOURNAL_TYPE,
        sourceType: "year_close",
        sourceId: year,
        note: `Tutup buku tahun ${year}`,
        lines: plan.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
        })),
      },
      tx
    );

    /* Tahun yang pernah dibatalkan menutup ULANG barisnya yang sama —
       `year` UNIK dan barisnya tidak pernah dihapus. */
    const row = existing
      ? await tx.yearClose.update({
          where: { year },
          data: {
            netIncome: new Prisma.Decimal(plan.netIncome),
            closedAccounts: plan.closedAccounts,
            closedById: userId,
            closedAt: new Date(),
            reversedAt: null,
            reversedById: null,
          },
        })
      : await tx.yearClose.create({
          data: {
            year,
            netIncome: new Prisma.Decimal(plan.netIncome),
            closedAccounts: plan.closedAccounts,
            closedById: userId,
          },
        });

    return { id: row.id, year, plan, journalId: journal.id };
  });
}

/**
 * Batalkan penutupan sebuah tahun buku.
 *
 * ══ JURNAL LAWAN, BUKAN `reverseJournal()` — dan sebabnya TAJAM ════════════
 * `reverseJournal()` menerbitkan jurnal bertipe `reversal`. Laba Rugi hanya
 * mengecualikan tipe `closing`, jadi pembalikan itu akan IKUT TERBACA sebagai
 * pendapatan dan beban: menutup lalu membatalkan akan membuat Laba Rugi
 * melaporkan pendapatan DUA KALI lipat. Seimbang, masuk akal bentuknya, dan
 * seluruhnya salah.
 *
 * Jurnal lawan di bawah ini bertipe `closing` juga, jadi keduanya sama-sama
 * tersaring dari Laba Rugi dan sama-sama terlihat oleh Neraca — yang bersih
 * saling menghapus, persis seperti yang dimaksud.
 *
 * Tanggalnya SAMA dengan jurnal aslinya (akhir tahun buku), bukan hari ini:
 * pembatalan harus mengembalikan neraca tanggal itu ke keadaan semula, dan
 * jurnal lawan bertanggal hari ini akan meninggalkan neraca akhir tahun tetap
 * tertutup sementara neraca hari ini terbuka.
 */
export async function reverseYearClose(
  year: number,
  userId: number | null,
  client: typeof prisma = prisma
): Promise<{ journalId: number }> {
  return client.$transaction(async (tx) => {
    const row = await tx.yearClose.findUnique({ where: { year } });
    if (!row || row.reversedAt !== null) {
      throw new Error(`Tahun buku ${year} tidak sedang tertutup.`);
    }

    const original = await tx.journal.findFirst({
      where: { sourceType: "year_close", sourceId: year, type: CLOSING_JOURNAL_TYPE },
      orderBy: { id: "desc" },
      include: { lines: true },
    });
    if (!original) throw new Error(`Jurnal penutup tahun ${year} tidak ditemukan.`);

    const journal = await postJournal(
      {
        date: original.date,
        type: CLOSING_JOURNAL_TYPE,
        sourceType: "year_close_reversal",
        sourceId: year,
        note: `Pembatalan tutup buku tahun ${year}`,
        lines: original.lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.credit),
          credit: Number(l.debit),
        })),
      },
      tx
    );

    await tx.yearClose.update({
      where: { year },
      data: { reversedAt: new Date(), reversedById: userId },
    });

    return { journalId: journal.id };
  });
}
