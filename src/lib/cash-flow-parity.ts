/**
 * PEMBANDING PARITAS Arus Kas — TypeScript ⇄ Go (tahap 1d, 09 §9).
 * Laporan Perubahan Ekuitas memakai pembantu yang sama dari sini
 * (`equity-statement-parity.ts`).
 *
 * Fungsi MURNI, pola yang sama dengan `statement-parity.ts` (dan pengurai sen
 * yang SAMA dari `trial-balance-parity.ts`): dua hasil masuk, daftar selisih
 * keluar. Dipanggil dua tempat dengan definisi yang satu:
 *
 *   • `scripts/parity-cash-flow.ts` (angka) — atas buku SUNGGUHAN (syarat
 *     `go-parity` → `go`); isi berkasnya `scripts/parity-cash-flow-xlsx.ts`;
 *   • `tests/cash-flow-equity-golden.test.ts` — atas buku fixture bersama,
 *     terhadap berkas emas Go, di setiap `bun run verify`.
 *
 * Yang dibandingkan, Arus Kas: kelompok (kategori & URUTAN), setiap baris
 * akun lawan per kelompok (kode, URUTAN, nama, tipe, masuk, keluar, bersih),
 * jumlah per kelompok, total masuk/keluar/perubahan, kas awal & akhir, rincian
 * per akun kas (kode, urutan, nama, awal, akhir, gerak), vonis rekonsiliasi,
 * dan hitungan baris valas berkurs 1. Ketelitiannya SEN kontrak
 * (`MONEY_SCALE`); selisih yang tersisa sesudah pembulatan itu nyata.
 */
import type { CashFlowReport } from "@/lib/reports";
import { formatUnits, goUnits, tsUnits } from "@/lib/trial-balance-parity";

type Money = string;

/** Bentuk keluaran `parity cash-flow` (Go) — uang sebagai teks desimal. */
export interface GoCashFlow {
  from: string | null;
  to: string | null;
  groups: {
    category: string;
    lines: { code: string; name: string; type: string; inflow: Money; outflow: Money; net: Money }[];
    inflow: Money;
    outflow: Money;
    net: Money;
  }[];
  totalInflow: Money;
  totalOutflow: Money;
  netChange: Money;
  openingCash: Money;
  closingCash: Money;
  cashAccounts: { code: string; name: string; opening: Money; closing: Money; net: Money }[];
  reconciled: boolean;
  suspectUnrated: number;
  unknownTypes: string[];
}

export function compareAmount(diffs: string[], label: string, ts: number, go: Money): void {
  const [t, g] = [tsUnits(ts), goUnits(go)];
  if (t !== g) diffs.push(`${label}: TS ${formatUnits(t)} ⇄ Go ${formatUnits(g)}`);
}

/**
 * Baris berkode: himpunan kode, URUTAN (hanya bila himpunannya sama — kalau
 * tidak, selisih urutan cuma gema dari baris yang hilang), lalu medan teks
 * dan uang per kode.
 */
export function compareRows<T extends { code: string; name: string }, G extends { code: string; name: string }>(
  diffs: string[],
  label: string,
  ts: readonly T[],
  go: readonly G[],
  texts: readonly (keyof T & keyof G & string)[],
  money: readonly (keyof T & keyof G & string)[]
): void {
  const before = diffs.length;
  const tsCodes = ts.map((r) => r.code);
  const goCodes = go.map((r) => r.code);
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
  const goByCode = new Map(go.map((r) => [r.code, r]));
  for (const t of ts) {
    const g = goByCode.get(t.code);
    if (!g) continue;
    for (const f of ["name", ...texts] as const) {
      const [a, b] = [t[f as keyof T], g[f as keyof G]];
      if (a !== b) diffs.push(`${label} ${t.code}: ${f} TS ${JSON.stringify(a)} ⇄ Go ${JSON.stringify(b)}`);
    }
    for (const f of money) {
      compareAmount(diffs, `${label} ${t.code} ${f}`, t[f] as number, g[f] as Money);
    }
  }
}

/** Daftar selisih Arus Kas; kosong = setara. */
export function compareCashFlow(ts: CashFlowReport, go: GoCashFlow): string[] {
  const diffs: string[] = [];
  const tsCats = ts.groups.map((g) => g.category).join(",");
  const goCats = go.groups.map((g) => g.category).join(",");
  if (tsCats !== goCats) {
    diffs.push(`kelompok: TS [${tsCats}] ⇄ Go [${goCats}]`);
    return diffs;
  }
  ts.groups.forEach((t, i) => {
    const g = go.groups[i]!;
    compareRows(diffs, t.category, t.lines, g.lines, ["type"], ["inflow", "outflow", "net"]);
    compareAmount(diffs, `${t.category} masuk`, t.inflow, g.inflow);
    compareAmount(diffs, `${t.category} keluar`, t.outflow, g.outflow);
    compareAmount(diffs, `${t.category} bersih`, t.net, g.net);
  });
  compareAmount(diffs, "total masuk", ts.totalInflow, go.totalInflow);
  compareAmount(diffs, "total keluar", ts.totalOutflow, go.totalOutflow);
  compareAmount(diffs, "perubahan kas", ts.netChange, go.netChange);
  compareAmount(diffs, "kas awal", ts.openingCash, go.openingCash);
  compareAmount(diffs, "kas akhir", ts.closingCash, go.closingCash);
  compareRows(diffs, "akun kas", ts.cashAccounts, go.cashAccounts, [], ["opening", "closing", "net"]);
  /* Vonis yang TERCETAK di berkas ("cocok dengan buku besar"). */
  if (ts.reconciled !== go.reconciled) {
    diffs.push(`vonis rekonsiliasi TS ${ts.reconciled} ⇄ Go ${go.reconciled}`);
  }
  /* Peringatan "valas berkurs 1" di layar — data, bukan hiasan. */
  if (ts.suspectUnrated !== go.suspectUnrated) {
    diffs.push(`valas berkurs 1: TS ${ts.suspectUnrated} ⇄ Go ${go.suspectUnrated}`);
  }
  return diffs;
}
