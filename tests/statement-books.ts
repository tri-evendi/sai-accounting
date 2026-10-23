/**
 * BUKU FIXTURE BERSAMA laporan keuangan — sisi TS dari
 * `services/integrator/internal/ledgerread/testdata/statement_books.json`.
 *
 * Dipakai `tests/statements-golden.test.ts` (Laba Rugi & Neraca) dan
 * `tests/cash-flow-equity-golden.test.ts` (Arus Kas & Laporan Perubahan
 * Ekuitas): buku yang SAMA, klien palsu yang SAMA, berkas emas Go yang SAMA.
 * Satu pemuat untuk keduanya — dua pemuat adalah dua tafsir atas satu fixture,
 * dan selisih tafsir terbaca sebagai selisih TS ⇄ Go.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeReportClient } from "./fake-client";
import { AKAR_REPO } from "./akar-sumber";

const GO = join(AKAR_REPO, "services", "integrator", "internal");
const NUMBERS = join(GO, "ledgerread", "testdata");
const SHEETS = join(GO, "document", "testdata");

export interface Line {
  accountId: number;
  debit?: string;
  credit?: string;
  currency?: string;
  rate?: string;
  baseDebit?: string;
  baseCredit?: string;
  costCenterId?: number | null;
}

export interface Book {
  name: string;
  companyName: string;
  fiscalYearStart: string | null;
  costCenters: { id: number; code: string; name: string; isActive?: boolean }[];
  accounts: { id: number; code: string; name: string; type: string }[];
  journals: { date: string; type?: string; lines: Line[] }[];
  incomeStatements: { case: string; from: string; to: string; costCenter?: string }[];
  balanceSheets: { case: string; asOf: string }[];
  incomeComparisons?: { case: string; from: string; to: string; costCenter?: string; compare: string }[];
  balanceComparisons?: { case: string; asOf: string; compare: string }[];
  /** Arus Kas & Laporan Perubahan Ekuitas (tahap 1d, 23 Okt 2026). */
  cashFlows?: { case: string; from: string; to: string }[];
  equityStatements?: { case: string; from: string; to: string }[];
}

export const BOOKS = JSON.parse(readFileSync(join(NUMBERS, "statement_books.json"), "utf8")) as Book[];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Klien palsu satu buku. `groupBy` dibulatkan ke sen: `SUM` NUMERIC di
 * PostgreSQL TEPAT, sedangkan penjumlah palsu menjumlahkan float — tanpa ini
 * akun "bergerak lalu nol" bisa tersisa 1e-12 dan tampil di TS, yaitu temuan
 * tentang klien palsu, bukan tentang laporan.
 */
export function client(book: Book) {
  const fake = createFakeReportClient({
    accounts: book.accounts,
    fiscalYearStart: book.fiscalYearStart ? new Date(book.fiscalYearStart) : undefined,
    costCenters: book.costCenters,
    journals: book.journals.map((j) => ({
      date: new Date(j.date),
      type: j.type,
      lines: j.lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
        currency: l.currency,
        rate: l.rate === undefined ? undefined : Number(l.rate),
        /* Aturan yang SAMA dengan `base()` di statements_test.go. */
        baseDebit: Number(l.baseDebit ?? l.debit ?? 0),
        baseCredit: Number(l.baseCredit ?? l.credit ?? 0),
        costCenterId: l.costCenterId ?? null,
      })),
    })),
  });
  const groupBy = fake.journalLine.groupBy.bind(fake.journalLine) as unknown as (
    args: unknown
  ) => Promise<{ accountId: number; _sum: { baseDebit: number; baseCredit: number } }[]>;
  (fake.journalLine as unknown as { groupBy: unknown }).groupBy = async (args: unknown) =>
    (await groupBy(args)).map((g) => ({
      accountId: g.accountId,
      _sum: { baseDebit: round2(g._sum.baseDebit), baseCredit: round2(g._sum.baseCredit) },
    }));
  return fake;
}

export const goNumbers = <T>(name: string): T =>
  JSON.parse(readFileSync(join(NUMBERS, `${name}.golden.json`), "utf8")) as T;
export const goSheet = (name: string) => new Uint8Array(readFileSync(join(SHEETS, `${name}.golden.xlsx`)));
