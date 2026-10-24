/**
 * PEMBANDING PARITAS Laporan Perubahan Ekuitas — TypeScript ⇄ Go (tahap 1d,
 * 09 §9). Pola dan pembantu yang sama dengan `cash-flow-parity.ts`.
 *
 * Dipanggil `scripts/parity-equity-changes.ts` (buku SUNGGUHAN) dan
 * `tests/cash-flow-equity-golden.test.ts` (buku fixture bersama). Yang
 * dibandingkan: setiap komponen (kode, URUTAN, nama, awal, tambah, kurang,
 * akhir), laba belum ditutup (awal, gerak, akhir, dan ARAH geraknya), dan
 * kedua total — pada sen kontrak.
 */
import type { EquityStatement } from "@/lib/equity-statement";
import { compareAmount, compareRows } from "@/lib/cash-flow-parity";
import { goUnits } from "@/lib/trial-balance-parity";

type Money = string;

/** Bentuk keluaran `parity equity-changes` (Go) — uang sebagai teks desimal. */
export interface GoEquityStatement {
  from: string;
  to: string;
  components: {
    code: string;
    name: string;
    opening: Money;
    additions: Money;
    reductions: Money;
    closing: Money;
  }[];
  unclosedIncome: { opening: Money; movement: Money; closing: Money };
  totalOpening: Money;
  totalClosing: Money;
  unknownTypes: string[];
  /** Bentuk usaha (24 Okt 2026). `omitempty` di Go: TIDAK ADA untuk buku PT. */
  partners?: {
    name: string;
    role: string | null;
    shareBp: number;
    isActive: boolean;
    opening: Money;
    profitShare: Money;
    contributions: Money;
    drawings: Money;
    closing: Money;
  }[];
}

/** Daftar selisih Laporan Perubahan Ekuitas; kosong = setara. */
export function compareEquityStatement(ts: EquityStatement, go: GoEquityStatement): string[] {
  const diffs: string[] = [];
  compareRows(diffs, "komponen", ts.components, go.components, [], [
    "opening",
    "additions",
    "reductions",
    "closing",
  ]);
  compareAmount(diffs, "laba belum ditutup awal", ts.unclosedIncome.opening, go.unclosedIncome.opening);
  compareAmount(diffs, "laba belum ditutup gerak", ts.unclosedIncome.movement, go.unclosedIncome.movement);
  compareAmount(diffs, "laba belum ditutup akhir", ts.unclosedIncome.closing, go.unclosedIncome.closing);
  compareAmount(diffs, "total awal", ts.totalOpening, go.totalOpening);
  compareAmount(diffs, "total akhir", ts.totalClosing, go.totalClosing);

  /* Rincian per pemilik/sekutu — URUTAN, identitas, dan kelima besaran. Buku PT:
     kosong di TS, tidak ada di Go (`omitempty`), keduanya setara. */
  const goPartners = go.partners ?? [];
  if (ts.partners.length !== goPartners.length) {
    diffs.push(`pemilik/sekutu: TS ${ts.partners.length} baris ⇄ Go ${goPartners.length} baris`);
  } else {
    ts.partners.forEach((t, i) => {
      const g = goPartners[i]!;
      const label = `pemilik #${i + 1} ${t.name}`;
      for (const f of ["name", "role", "shareBp", "isActive"] as const) {
        if (t[f] !== g[f]) diffs.push(`${label}: ${f} TS ${JSON.stringify(t[f])} ⇄ Go ${JSON.stringify(g[f])}`);
      }
      for (const f of ["opening", "profitShare", "contributions", "drawings", "closing"] as const) {
        compareAmount(diffs, `${label} ${f}`, t[f], g[f]);
      }
    });
  }
  /* Arah gerak laba belum ditutup memutuskan KOLOM yang memikulnya di layar
     (tambah bila > 0, kurang bila < 0). Float TS yang impas bisa jatuh ke
     ±0,0000001 — itu temuan tentang sisi TS, dan ia terlihat di sini. */
  const sign = (n: number | bigint) => (n > 0 ? 1 : n < 0 ? -1 : 0);
  if (sign(ts.unclosedIncome.movement) !== sign(goUnits(go.unclosedIncome.movement))) {
    diffs.push(
      `arah gerak laba belum ditutup: TS ${ts.unclosedIncome.movement} ⇄ Go ${go.unclosedIncome.movement}`
    );
  }
  return diffs;
}
