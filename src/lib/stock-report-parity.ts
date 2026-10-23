/**
 * PEMBANDING PARITAS laporan stok — TypeScript ⇄ Go (tahap 1d, 09 §9).
 *
 * Nilai Persediaan, Riwayat Stok (Kartu Stok), dan Riwayat Hitung Ulang Stok.
 * Fungsi MURNI, pola `cash-flow-parity.ts`: dua hasil masuk, daftar selisih
 * keluar. Dipanggil dua tempat dengan definisi yang satu:
 *
 *   • `scripts/parity-stock.ts` (angka) — atas buku SUNGGUHAN (syarat
 *     `go-parity` → `go`); isi berkasnya `scripts/parity-stock-xlsx.ts`;
 *   • `tests/stock-golden.test.ts` — atas buku fixture bersama, terhadap berkas
 *     emas Go, di setiap `bun run verify`.
 *
 * ══ EKSAK, BUKAN SEN ═══════════════════════════════════════════════════════
 * Berbeda dari laporan keuangan (Go sen int64, pembanding pada sen), Go di
 * sini meniru FLOAT TS dalam urutan operasi yang sama
 * (`services/integrator/internal/ledgerread/stock.go`), dan JSON-nya
 * membulat-balik ke double yang sama. Jadi setiap angka dibandingkan `===`:
 * kuantitas Decimal(15,3) tidak punya "sen" yang bisa dijadikan toleransi,
 * dan sisa float seperti 5,55e-17 menentukan apakah barang "tak bergerak" —
 * selisih sekecil apa pun adalah selisih yang nyata di berkas.
 */
import type { StockMovementReport } from "@/lib/stock-movement";
import type { OpnameHistory } from "@/lib/opname-history";
import type { StockValuePeriodReport } from "@/lib/stock-value-report";

/** Bentuk keluaran `parity stock-value` (Go). */
export interface GoStockValue {
  from: string;
  to: string;
  rows: {
    id: number;
    code: string;
    name: string;
    unit: string | null;
    openingQty: number;
    inQty: number;
    outQty: number;
    closingQty: number;
    openingValue: number | null;
    inValue: number | null;
    outValue: number | null;
    closingValue: number | null;
    revaluation: number;
  }[];
  totalOpeningValue: number;
  totalInValue: number;
  totalOutValue: number;
  totalClosingValue: number;
  totalRevaluation: number;
  uncostedCount: number;
  dormantCount: number;
}

/** Bentuk keluaran `parity stock-movement` (Go). */
export interface GoStockMovement {
  from: string;
  to: string;
  rows: {
    id: number;
    name: string;
    unit: string | null;
    opening: number;
    movedIn: number;
    movedOut: number;
    processed: number;
    closing: number;
  }[];
  totalOpening: number;
  totalIn: number;
  totalOut: number;
  totalProcessed: number;
  totalClosing: number;
  hasProcess: boolean;
  dormantCount: number;
}

/** Bentuk keluaran `parity opname-history` (Go). */
export interface GoOpnameHistory {
  from: string;
  to: string;
  sessions: {
    dateISO: string;
    adjustments: { itemName: string; unit: string | null; variance: number }[];
    increase: number;
    decrease: number;
  }[];
  sessionCount: number;
  adjustmentCount: number;
  totalIncrease: number;
  totalDecrease: number;
  netVariance: number;
}

/** Satu nilai: angka `===` (null hanya sama dengan null), teks & boolean `===`. */
function same(diffs: string[], label: string, ts: unknown, go: unknown): void {
  if (ts === go) return;
  /* `undefined` dari medan opsional TS = `null` JSON Go. */
  if ((ts === undefined || ts === null) && go === null) return;
  diffs.push(`${label}: TS ${JSON.stringify(ts)} ⇄ Go ${JSON.stringify(go)}`);
}

/**
 * Baris berkunci: himpunan kunci, URUTAN (hanya bila himpunannya sama), lalu
 * setiap medan per kunci.
 */
function compareKeyed<T extends object, G extends object>(
  diffs: string[],
  label: string,
  ts: readonly T[],
  go: readonly G[],
  key: (r: T | G) => string,
  fields: readonly (keyof T & keyof G & string)[]
): void {
  const before = diffs.length;
  const tsKeys = ts.map(key);
  const goKeys = go.map(key);
  const goSet = new Set(goKeys);
  const tsSet = new Set(tsKeys);
  for (const k of tsKeys) if (!goSet.has(k)) diffs.push(`${label} ${k}: hanya di TS`);
  for (const k of goKeys) if (!tsSet.has(k)) diffs.push(`${label} ${k}: hanya di Go`);
  if (tsKeys.length !== goKeys.length && diffs.length === before) {
    diffs.push(`${label}: TS ${tsKeys.length} baris ⇄ Go ${goKeys.length} baris (kunci ganda)`);
  }
  if (diffs.length === before && tsKeys.join("\n") !== goKeys.join("\n")) {
    const i = tsKeys.findIndex((k, n) => k !== goKeys[n]);
    diffs.push(`${label}: urutan berbeda mulai baris ${i + 1}: TS ${tsKeys[i]} ⇄ Go ${goKeys[i]}`);
  }
  const goByKey = new Map(go.map((r) => [key(r), r]));
  for (const t of ts) {
    const g = goByKey.get(key(t));
    if (!g) continue;
    for (const f of fields) same(diffs, `${label} ${key(t)} ${f}`, t[f], g[f]);
  }
}

/** Daftar selisih Nilai Persediaan; kosong = setara. */
export function compareStockValue(ts: StockValuePeriodReport, go: GoStockValue): string[] {
  const diffs: string[] = [];
  compareKeyed(diffs, "barang", ts.rows, go.rows, (r) => r.code, [
    "id",
    "name",
    "unit",
    "openingQty",
    "inQty",
    "outQty",
    "closingQty",
    "openingValue",
    "inValue",
    "outValue",
    "closingValue",
    "revaluation",
  ]);
  for (const f of [
    "totalOpeningValue",
    "totalInValue",
    "totalOutValue",
    "totalClosingValue",
    "totalRevaluation",
    "uncostedCount",
    "dormantCount",
  ] as const) {
    same(diffs, f, ts[f], go[f]);
  }
  return diffs;
}

/** Daftar selisih Riwayat Stok / Kartu Stok; kosong = setara. */
export function compareStockMovement(ts: StockMovementReport, go: GoStockMovement): string[] {
  const diffs: string[] = [];
  /* Kunci = id: nama barang boleh kembar sejak #493. */
  compareKeyed(diffs, "barang", ts.rows, go.rows, (r) => String(r.id), [
    "name",
    "unit",
    "opening",
    "movedIn",
    "movedOut",
    "processed",
    "closing",
  ]);
  for (const f of [
    "totalOpening",
    "totalIn",
    "totalOut",
    "totalProcessed",
    "totalClosing",
    "hasProcess",
    "dormantCount",
  ] as const) {
    same(diffs, f, ts[f], go[f]);
  }
  return diffs;
}

/** Daftar selisih Riwayat Hitung Ulang Stok; kosong = setara. */
export function compareOpnameHistory(ts: OpnameHistory, go: GoOpnameHistory): string[] {
  const diffs: string[] = [];
  compareKeyed(diffs, "sesi", ts.sessions, go.sessions, (s) => s.dateISO, ["increase", "decrease"]);
  const goByDay = new Map(go.sessions.map((s) => [s.dateISO, s]));
  for (const t of ts.sessions) {
    const g = goByDay.get(t.dateISO);
    if (!g) continue;
    if (t.adjustments.length !== g.adjustments.length) {
      diffs.push(`sesi ${t.dateISO}: TS ${t.adjustments.length} penyesuaian ⇄ Go ${g.adjustments.length}`);
      continue;
    }
    /* Urutan penyesuaian = urutan cetak (|selisih| ↓, lalu `localeCompare`). */
    t.adjustments.forEach((a, i) => {
      const b = g.adjustments[i]!;
      for (const f of ["itemName", "unit", "variance"] as const) {
        same(diffs, `sesi ${t.dateISO} #${i + 1} ${f}`, a[f], b[f]);
      }
    });
  }
  for (const f of [
    "sessionCount",
    "adjustmentCount",
    "totalIncrease",
    "totalDecrease",
    "netVariance",
  ] as const) {
    same(diffs, f, ts[f], go[f]);
  }
  return diffs;
}
