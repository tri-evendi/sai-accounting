/**
 * PEMBANDING PARITAS Laba Rugi & Neraca — TypeScript ⇄ Go (tahap 1d, 09 §9).
 *
 * Fungsi MURNI, pola yang sama dengan `trial-balance-parity.ts` (dan memakai
 * pengurai sen yang SAMA darinya): dua hasil masuk, daftar selisih keluar.
 * Dipanggil dua tempat dengan definisi yang satu:
 *
 *   • `scripts/parity-income-statement.ts` / `scripts/parity-balance-sheet.ts`
 *     — atas buku SUNGGUHAN (syarat `go-parity` → `go`);
 *   • `tests/statements-golden.test.ts` — atas buku fixture bersama, terhadap
 *     berkas emas Go, di setiap `bun run verify`.
 *
 * Yang dibandingkan: setiap baris akun (kode, URUTAN, nama, jumlah) di setiap
 * band/seksi, setiap subtotal dan anak tangga, dan — Neraca — pecahan laba
 * tahun berjalan / tahun lalu (#555) beserta vonis seimbang. Ketelitiannya SEN
 * kontrak (`MONEY_SCALE`); selisih yang tersisa sesudah pembulatan itu nyata.
 */
import type { IncomeStatement, StatementLine } from "@/lib/reports";
import { formatUnits, goUnits, tsUnits } from "@/lib/trial-balance-parity";

/** Satu baris Go — uang sebagai teks desimal. */
export interface GoStatementLine {
  code: string;
  name: string;
  amount: string;
}

interface GoSection {
  lines: GoStatementLine[];
  total: string;
}

/** Bentuk keluaran `parity income-statement` (Go). */
export interface GoIncomeStatement {
  revenue: GoStatementLine[];
  expense: GoStatementLine[];
  totalRevenue: string;
  totalExpense: string;
  netIncome: string;
  sales: GoSection;
  cogs: GoSection;
  grossProfit: string;
  operatingExpense: GoSection;
  operatingProfit: string;
  otherIncome: GoSection;
  otherExpense: GoSection;
  unknownTypes: string[];
}

/** Bentuk keluaran `parity balance-sheet` (Go). */
export interface GoBalanceSheet {
  asOf: string;
  assets: GoStatementLine[];
  liabilities: GoStatementLine[];
  equity: GoStatementLine[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  netIncome: string;
  currentYearIncome: string;
  priorUnclosedIncome: string;
  totalLiabilitiesEquity: string;
  balanced: boolean;
  unknownTypes: string[];
}

/** Hasil `getBalanceSheet` — struktural, supaya tes bisa menyerahkan bentuk yang sama. */
export interface TsBalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number;
  currentYearIncome: number;
  priorUnclosedIncome: number;
  totalLiabilitiesEquity: number;
  balanced: boolean;
}

function compareAmount(diffs: string[], label: string, ts: number, go: string): void {
  const [t, g] = [tsUnits(ts), goUnits(go)];
  if (t !== g) diffs.push(`${label}: TS ${formatUnits(t)} ⇄ Go ${formatUnits(g)}`);
}

/**
 * Baris satu band/seksi: himpunan kode, URUTAN (hanya bila himpunannya sama —
 * kalau tidak, selisih urutan cuma gema dari baris yang hilang), nama, jumlah.
 */
function compareLines(
  diffs: string[],
  label: string,
  ts: readonly StatementLine[],
  go: readonly GoStatementLine[]
): void {
  const before = diffs.length;
  const tsCodes = ts.map((l) => l.code);
  const goCodes = go.map((l) => l.code);
  const goSet = new Set(goCodes);
  const tsSet = new Set(tsCodes);
  for (const c of tsCodes) if (!goSet.has(c)) diffs.push(`${label} ${c}: hanya di TS`);
  for (const c of goCodes) if (!tsSet.has(c)) diffs.push(`${label} ${c}: hanya di Go`);
  if (tsCodes.length !== goCodes.length && diffs.length === before) {
    diffs.push(`${label}: TS ${tsCodes.length} baris ⇄ Go ${goCodes.length} baris (kode ganda)`);
  }
  if (diffs.length === before && tsCodes.join("\n") !== goCodes.join("\n")) {
    const i = tsCodes.findIndex((c, k) => c !== goCodes[k]);
    diffs.push(`${label}: urutan berbeda mulai baris ${i + 1}: TS ${tsCodes[i]} ⇄ Go ${goCodes[i]}`);
  }
  const goByCode = new Map(go.map((l) => [l.code, l]));
  for (const t of ts) {
    const g = goByCode.get(t.code);
    if (!g) continue;
    if (t.name !== g.name) {
      diffs.push(`${label} ${t.code}: nama TS ${JSON.stringify(t.name)} ⇄ Go ${JSON.stringify(g.name)}`);
    }
    compareAmount(diffs, `${label} ${t.code}`, t.amount, g.amount);
  }
}

/** Daftar selisih Laba Rugi; kosong = setara. */
export function compareIncomeStatement(ts: IncomeStatement, go: GoIncomeStatement): string[] {
  const diffs: string[] = [];
  const sections = [
    ["penjualan", ts.sales, go.sales],
    ["HPP", ts.cogs, go.cogs],
    ["beban operasional", ts.operatingExpense, go.operatingExpense],
    ["pendapatan lain", ts.otherIncome, go.otherIncome],
    ["beban lain", ts.otherExpense, go.otherExpense],
  ] as const;
  for (const [label, t, g] of sections) {
    compareLines(diffs, label, t.lines, g.lines);
    compareAmount(diffs, `total ${label}`, t.total, g.total);
  }
  /* Tampilan datar ikut dibandingkan: Anggaran vs Realisasi dan Sifat Beban
     membacanya, bukan band. */
  compareLines(diffs, "pendapatan (datar)", ts.revenue, go.revenue);
  compareLines(diffs, "beban (datar)", ts.expense, go.expense);
  compareAmount(diffs, "laba kotor", ts.grossProfit, go.grossProfit);
  compareAmount(diffs, "laba usaha", ts.operatingProfit, go.operatingProfit);
  compareAmount(diffs, "total pendapatan", ts.totalRevenue, go.totalRevenue);
  compareAmount(diffs, "total beban", ts.totalExpense, go.totalExpense);
  compareAmount(diffs, "laba bersih", ts.netIncome, go.netIncome);
  /* Arah hasil tercetak di berkas ("Laba"/"Rugi", `>= 0`). Float TS yang
     impas bisa jatuh ke −0,0000001 — itu temuan tentang sisi TS, dan ia
     terlihat di sini, bukan hanya di lembar sebarnya. */
  if ((ts.netIncome >= 0) !== (goUnits(go.netIncome) >= BigInt(0))) {
    diffs.push(`arah hasil: TS ${ts.netIncome >= 0 ? "Laba" : "Rugi"} ⇄ Go ${go.netIncome}`);
  }
  return diffs;
}

/** Daftar selisih Neraca; kosong = setara. */
export function compareBalanceSheet(ts: TsBalanceSheet, go: GoBalanceSheet): string[] {
  const diffs: string[] = [];
  compareLines(diffs, "aset", ts.assets, go.assets);
  compareLines(diffs, "liabilitas", ts.liabilities, go.liabilities);
  compareLines(diffs, "ekuitas", ts.equity, go.equity);
  compareAmount(diffs, "total aset", ts.totalAssets, go.totalAssets);
  compareAmount(diffs, "total liabilitas", ts.totalLiabilities, go.totalLiabilities);
  compareAmount(diffs, "total ekuitas akun", ts.totalEquity, go.totalEquity);
  compareAmount(diffs, "laba belum ditutup", ts.netIncome, go.netIncome);
  compareAmount(diffs, "laba tahun berjalan", ts.currentYearIncome, go.currentYearIncome);
  compareAmount(diffs, "laba tahun lalu belum ditutup", ts.priorUnclosedIncome, go.priorUnclosedIncome);
  compareAmount(diffs, "total liabilitas + ekuitas", ts.totalLiabilitiesEquity, go.totalLiabilitiesEquity);
  if (ts.balanced !== go.balanced) diffs.push(`vonis seimbang TS ${ts.balanced} ⇄ Go ${go.balanced}`);
  return diffs;
}
