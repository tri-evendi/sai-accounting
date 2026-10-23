/**
 * PEMBANDING PARITAS Rekap per Pihak, Laporan Kas & Bank, dan Realisasi vs
 * Anggaran — TypeScript ⇄ Go (tahap 1d, 09 §9, gelombang A 23 Okt 2026).
 *
 * Fungsi MURNI, pola yang sama dengan `cash-flow-parity.ts` / `aging-parity.ts`:
 * dua hasil masuk, daftar selisih keluar. Dipanggil dua tempat dengan definisi
 * yang satu:
 *
 *   • `scripts/parity-party-recap.ts`, `parity-cash-bank.ts`, `parity-budget.ts`
 *     (angka) — atas buku SUNGGUHAN (syarat `go-parity` → `go`); isi berkasnya
 *     varian `-xlsx` (`src/lib/xlsx-content-parity.ts`);
 *   • `tests/recap-golden.test.ts` — atas buku fixture, di setiap
 *     `bun run verify`.
 *
 * Ketelitian uang = SEN kontrak (`MONEY_SCALE`). Persen selisih anggaran
 * dibandingkan PERSIS (angka float yang sama, sebab ia sel angka di berkas).
 */
import type { PartyRecapResult } from "@/lib/party-recap";
import type { BudgetReport, VarianceStatus } from "@/lib/budget";
import type { SalesTargetRealizationResult } from "@/lib/budget-report";
import { compareAmount } from "@/lib/cash-flow-parity";

type Money = string;

// ── Rekap per Pihak ─────────────────────────────────────────────────────────

/** Bentuk keluaran `parity sales-by-customer|purchases-by-supplier` (Go). */
export interface GoPartyRecap {
  kind: string;
  from: string;
  to: string;
  rows: {
    partyId: number | null;
    partyName: string | null;
    docCount: number;
    grossBase: Money;
    returnCount: number;
    returnBase: Money;
    netBase: Money;
    unratedCount: number;
  }[];
  totals: {
    docCount: number;
    grossBase: Money;
    returnCount: number;
    returnBase: Money;
    netBase: Money;
    unratedCount: number;
  };
}

const partyKey = (id: number | null) => (id == null ? "tanpa pihak" : `#${id}`);

export function comparePartyRecap(ts: PartyRecapResult, go: GoPartyRecap): string[] {
  const diffs: string[] = [];
  const tsKeys = ts.rows.map((r) => partyKey(r.partyId));
  const goKeys = go.rows.map((r) => partyKey(r.partyId));
  const goSet = new Set(goKeys);
  const tsSet = new Set(tsKeys);
  for (const k of tsKeys) if (!goSet.has(k)) diffs.push(`pihak ${k}: hanya di TS`);
  for (const k of goKeys) if (!tsSet.has(k)) diffs.push(`pihak ${k}: hanya di Go`);
  if (diffs.length === 0 && tsKeys.join("\n") !== goKeys.join("\n")) {
    const i = tsKeys.findIndex((k, n) => k !== goKeys[n]);
    diffs.push(`urutan berbeda mulai baris ${i + 1}: TS ${tsKeys[i]} ⇄ Go ${goKeys[i]}`);
  }
  const byKey = new Map(go.rows.map((r) => [partyKey(r.partyId), r]));
  for (const t of ts.rows) {
    const k = partyKey(t.partyId);
    const g = byKey.get(k);
    if (!g) continue;
    if ((t.partyName ?? null) !== (g.partyName ?? null)) {
      diffs.push(`pihak ${k} nama: TS ${JSON.stringify(t.partyName)} ⇄ Go ${JSON.stringify(g.partyName)}`);
    }
    for (const f of ["docCount", "returnCount", "unratedCount"] as const) {
      if (t[f] !== g[f]) diffs.push(`pihak ${k} ${f}: TS ${t[f]} ⇄ Go ${g[f]}`);
    }
    for (const f of ["grossBase", "returnBase", "netBase"] as const) {
      compareAmount(diffs, `pihak ${k} ${f}`, t[f], g[f]);
    }
  }
  for (const f of ["docCount", "returnCount", "unratedCount"] as const) {
    if (ts.totals[f] !== go.totals[f]) diffs.push(`total ${f}: TS ${ts.totals[f]} ⇄ Go ${go.totals[f]}`);
  }
  for (const f of ["grossBase", "returnBase", "netBase"] as const) {
    compareAmount(diffs, `total ${f}`, ts.totals[f], go.totals[f]);
  }
  return diffs;
}

// ── Laporan Kas & Bank ──────────────────────────────────────────────────────

/** Bentuk keluaran `parity cash-bank` (Go). */
export interface GoCashBank {
  from: string;
  to: string;
  rows: { code: string; name: string; opening: Money; net: Money; closing: Money }[];
  openingCash: Money;
  netChange: Money;
  closingCash: Money;
}

/** Bagian muatan `cash-bank` yang dibandingkan (`cashBankPayload`). */
export interface TsCashBank {
  rows: { code: string; name: string; opening: number; net: number; closing: number }[];
  openingCash: number;
  netChange: number;
  closingCash: number;
}

export function compareCashBank(ts: TsCashBank, go: GoCashBank): string[] {
  const diffs: string[] = [];
  const tsCodes = ts.rows.map((r) => r.code);
  const goCodes = go.rows.map((r) => r.code);
  if (tsCodes.join("\n") !== goCodes.join("\n")) {
    diffs.push(`akun kas: TS [${tsCodes.join(", ")}] ⇄ Go [${goCodes.join(", ")}]`);
  } else {
    ts.rows.forEach((t, i) => {
      const g = go.rows[i]!;
      if (t.name !== g.name) diffs.push(`akun ${t.code} nama: TS ${JSON.stringify(t.name)} ⇄ Go ${JSON.stringify(g.name)}`);
      for (const f of ["opening", "net", "closing"] as const) compareAmount(diffs, `akun ${t.code} ${f}`, t[f], g[f]);
    });
  }
  compareAmount(diffs, "saldo kas awal", ts.openingCash, go.openingCash);
  compareAmount(diffs, "perubahan bersih", ts.netChange, go.netChange);
  compareAmount(diffs, "saldo kas akhir", ts.closingCash, go.closingCash);
  return diffs;
}

// ── Realisasi vs Anggaran ───────────────────────────────────────────────────

/** Bentuk keluaran `parity budget-realization` (Go). */
export interface GoBudgetRealization {
  year: number;
  month: number;
  from: string;
  to: string;
  rows: {
    code: string;
    name: string;
    category: string;
    budget: Money;
    actual: Money;
    variance: Money;
    variancePct: number | null;
    status: VarianceStatus;
  }[];
  totals: { budget: Money; actual: Money; variance: Money; variancePct: number | null; alertCount: number };
  hasBudgets: boolean;
  salesTarget: {
    totalTarget: Money;
    actualSales: Money;
    variance: Money;
    targetCount: number;
    hasTargets: boolean;
  };
  unknownTypes: string[];
}

function comparePct(diffs: string[], label: string, ts: number | null, go: number | null): void {
  /* Persen adalah sel ANGKA di berkas — dibandingkan persis, dengan −0 = 0. */
  const norm = (v: number | null) => (v === null ? "null" : String(v === 0 ? 0 : v));
  if (norm(ts) !== norm(go)) diffs.push(`${label}: TS ${norm(ts)} ⇄ Go ${norm(go)}`);
}

export function compareBudget(
  ts: { report: BudgetReport; sales: SalesTargetRealizationResult },
  go: GoBudgetRealization
): string[] {
  const diffs: string[] = [];
  const rows = ts.report.rows;
  const tsCodes = rows.map((r) => r.code);
  const goCodes = go.rows.map((r) => r.code);
  if (tsCodes.join("\n") !== goCodes.join("\n")) {
    diffs.push(`akun beranggaran: TS [${tsCodes.join(", ")}] ⇄ Go [${goCodes.join(", ")}]`);
  } else {
    rows.forEach((t, i) => {
      const g = go.rows[i]!;
      const label = `akun ${t.code}`;
      if (t.name !== g.name) diffs.push(`${label} nama: TS ${JSON.stringify(t.name)} ⇄ Go ${JSON.stringify(g.name)}`);
      if (t.category !== g.category) diffs.push(`${label} kategori: TS ${t.category} ⇄ Go ${g.category}`);
      for (const f of ["budget", "actual", "variance"] as const) compareAmount(diffs, `${label} ${f}`, t[f], g[f]);
      comparePct(diffs, `${label} persen`, t.variancePct, g.variancePct);
      if (t.status !== g.status) diffs.push(`${label} status: TS ${t.status} ⇄ Go ${g.status}`);
    });
  }
  const tt = ts.report.totals;
  for (const f of ["budget", "actual", "variance"] as const) compareAmount(diffs, `total ${f}`, tt[f], go.totals[f]);
  comparePct(diffs, "total persen", tt.variancePct, go.totals.variancePct);
  if (tt.alertCount !== go.totals.alertCount) {
    diffs.push(`akun di luar ambang: TS ${tt.alertCount} ⇄ Go ${go.totals.alertCount}`);
  }
  const s = ts.sales;
  const gs = go.salesTarget;
  if (s.hasTargets !== gs.hasTargets) diffs.push(`ada target: TS ${s.hasTargets} ⇄ Go ${gs.hasTargets}`);
  if (s.targetCount !== gs.targetCount) diffs.push(`jumlah target: TS ${s.targetCount} ⇄ Go ${gs.targetCount}`);
  compareAmount(diffs, "target penjualan", s.totalTarget, gs.totalTarget);
  compareAmount(diffs, "penjualan bersih", s.actualSales, gs.actualSales);
  compareAmount(diffs, "selisih target", s.row.variance, gs.variance);
  return diffs;
}
