/**
 * PEMBANDING PARITAS Umur Piutang & Umur Utang — TypeScript ⇄ Go (tahap 1d).
 *
 * Fungsi MURNI, pola yang sama dengan `trial-balance-parity.ts` /
 * `statement-parity.ts` (dan pengurai sen yang SAMA darinya): dua hasil masuk,
 * daftar selisih keluar. Pemanggilnya `scripts/parity-aging.ts` atas buku
 * SUNGGUHAN (syarat `go-parity` → `go`) dan `tests/aging-parity.test.ts`.
 *
 * Yang dibandingkan, per laporan: himpunan dokumen (jenis + id) dan URUTANNYA,
 * lalu per dokumen nomor, pihak, tanggal, jatuh tempo, mata uang, umur, asal
 * umur, ember, status, nilai IDR, dibayar, sisa, dan (Utang) tanda alokasi
 * perkiraan; lalu jumlah per ember, total, dokumen tanpa nilai IDR, dan
 * jumlah jatuh tempo.
 *
 * ══ DUA KETELITIAN, KARENA TS PUNYA DUA JENIS ANGKA ════════════════════════
 *   • Yang TS bulatkan ke sen (`round2`: dibayar, sisa, ember, total) —
 *     dibandingkan pada SEN kontrak, tanpa toleransi.
 *   • Yang TS TIDAK bulatkan (nilai dokumen dalam mata uangnya sendiri
 *     = Σ kuantitas × harga; nilai IDR = jumlah × kurs) — Go menulisnya
 *     EKSAK, TS sebagai float. Dibandingkan dengan toleransi relatif 1e-9:
 *     cukup untuk menelan galat float, terlalu sempit untuk menelan satu sen.
 *     Nilai null (valas tanpa kurs) wajib null di kedua sisi.
 *
 * ══ SERI SETENGAH SEN: TETAP SELISIH, TAPI DIBERI NAMA ═════════════════════
 * Go membulatkan nilai EKSAK; TS membulatkan float. Keduanya sepakat kecuali
 * nilai eksaknya TEPAT setengah sen (5,01 USD × 15.750,5 = 78.910,005): double
 * terdekatnya bisa sedikit di bawah, dan `Math.round` TS turun sementara Go
 * naik. Go menandai dokumen yang pembulatannya menyentuh titik seri
 * (`halfCentTie`), dan selisih pada dokumen itu ditulis dengan penanda
 * `SERI_FLOAT` — tetap DIHITUNG berselisih (gerbang tidak dilonggarkan), tetapi
 * pembacanya tahu ini temuan tentang float TS, bukan aturan yang berbeda.
 */
import { formatUnits, goUnits, tsUnits } from "@/lib/trial-balance-parity";

/** Satu dokumen keluaran `parity receivables|payables` (Go). */
export interface GoAgingDocument {
  kind: string;
  id: number;
  documentNo: string;
  partyName: string;
  date: string;
  dueDate: string | null;
  total: string;
  currency: string;
  totalBase: string | null;
  paidBase: string;
  outstandingBase: string | null;
  status: string;
  ageDays: number;
  ageFromIssue: boolean;
  bucket: string;
  allocationEstimated: boolean;
  halfCentTie: boolean;
}

/** Penanda selisih yang hanya terjadi di titik seri setengah sen (lihat kepala berkas). */
export const SERI_FLOAT = "[seri setengah sen — float TS]";

/** Keluaran `parity receivables|payables` (Go). */
export interface GoAgingReport {
  kind: string;
  asOf: string;
  overdueOnly: boolean;
  rows: GoAgingDocument[];
  buckets: { bucket: string; amount: string }[];
  total: string;
  unresolved: number;
  overdueCount: number;
}

/** Bentuk struktural `LedgerResult` TS — supaya tes bisa menyerahkan bentuk yang sama. */
export interface TsAgingDocument {
  kind: string;
  id: number;
  documentNo: string;
  partyName: string;
  date: Date;
  dueDate: Date | null;
  total: number;
  currency: string;
  totalBase: number | null;
  paidBase: number;
  outstandingBase: number | null;
  status: string;
  ageDays: number;
  ageFromIssue: boolean;
  bucket: string;
  allocationEstimated?: boolean;
}

export interface TsAgingResult {
  rows: TsAgingDocument[];
  aging: { buckets: Record<string, number>; total: number; unresolved: number };
  overdueCount: number;
}

/** Toleransi relatif untuk nilai yang TS biarkan float (lihat kepala berkas). */
const RELATIVE = 1e-9;

function closeEnough(ts: number, go: string): boolean {
  const g = Number(go);
  if (!Number.isFinite(g)) return false;
  return Math.abs(ts - g) <= RELATIVE * Math.max(1, Math.abs(g));
}

const key = (r: { kind: string; id: number }) => `${r.kind}#${r.id}`;

export function compareAging(ts: TsAgingResult, go: GoAgingReport): string[] {
  const diffs: string[] = [];

  /* ── Himpunan & urutan dokumen ── */
  const tsKeys = ts.rows.map(key);
  const goKeys = go.rows.map(key);
  const goSet = new Set(goKeys);
  const tsSet = new Set(tsKeys);
  for (const k of tsKeys) if (!goSet.has(k)) diffs.push(`${k}: hanya di TS`);
  for (const k of goKeys) if (!tsSet.has(k)) diffs.push(`${k}: hanya di Go`);
  if (diffs.length === 0 && tsKeys.join("\n") !== goKeys.join("\n")) {
    const i = tsKeys.findIndex((k, n) => k !== goKeys[n]);
    diffs.push(`urutan berbeda mulai baris ${i + 1}: TS ${tsKeys[i]} ⇄ Go ${goKeys[i]}`);
  }

  /* ── Per dokumen ── */
  const goByKey = new Map(go.rows.map((r) => [key(r), r]));
  for (const t of ts.rows) {
    const g = goByKey.get(key(t));
    if (!g) continue;
    const label = `${key(t)} (${t.documentNo})${g.halfCentTie ? ` ${SERI_FLOAT}` : ""}`;
    const same = (field: string, a: unknown, b: unknown) => {
      if (a !== b) diffs.push(`${label} ${field}: TS ${JSON.stringify(a)} ⇄ Go ${JSON.stringify(b)}`);
    };
    same("nomor", t.documentNo, g.documentNo);
    same("pihak", t.partyName, g.partyName);
    same("tanggal", t.date.getTime(), Date.parse(g.date));
    same("jatuh tempo", t.dueDate?.getTime() ?? null, g.dueDate === null ? null : Date.parse(g.dueDate));
    same("mata uang", t.currency, g.currency);
    same("umur", t.ageDays, g.ageDays);
    same("umur dari tanggal dokumen", t.ageFromIssue, g.ageFromIssue);
    same("ember", t.bucket, g.bucket);
    same("status", t.status, g.status);
    if (t.kind === "purchase") same("alokasi perkiraan", t.allocationEstimated === true, g.allocationEstimated);

    if (!closeEnough(t.total, g.total)) diffs.push(`${label} nilai dokumen: TS ${t.total} ⇄ Go ${g.total}`);
    if ((t.totalBase === null) !== (g.totalBase === null)) {
      diffs.push(`${label} nilai IDR: TS ${String(t.totalBase)} ⇄ Go ${String(g.totalBase)}`);
    } else if (t.totalBase !== null && !closeEnough(t.totalBase, g.totalBase!)) {
      diffs.push(`${label} nilai IDR: TS ${t.totalBase} ⇄ Go ${g.totalBase}`);
    }
    const [tp, gp] = [tsUnits(t.paidBase), goUnits(g.paidBase)];
    if (tp !== gp) diffs.push(`${label} dibayar: TS ${formatUnits(tp)} ⇄ Go ${formatUnits(gp)}`);
    if ((t.outstandingBase === null) !== (g.outstandingBase === null)) {
      diffs.push(`${label} sisa: TS ${String(t.outstandingBase)} ⇄ Go ${String(g.outstandingBase)}`);
    } else if (t.outstandingBase !== null) {
      const [to, gq] = [tsUnits(t.outstandingBase), goUnits(g.outstandingBase!)];
      if (to !== gq) diffs.push(`${label} sisa: TS ${formatUnits(to)} ⇄ Go ${formatUnits(gq)}`);
    }
  }

  /* ── Ringkasan ── selisih jumlah yang lahir dari baris seri ikut ditandai. */
  const tieRows = diffs.some((d) => d.includes(SERI_FLOAT));
  const sum = (d: string) => (tieRows ? `${d} ${SERI_FLOAT}` : d);
  const tsBuckets = Object.keys(ts.aging.buckets);
  const goBuckets = go.buckets.map((b) => b.bucket);
  if (tsBuckets.join(",") !== goBuckets.join(",")) {
    diffs.push(`ember: TS ${tsBuckets.join(",")} ⇄ Go ${goBuckets.join(",")}`);
  }
  for (const b of go.buckets) {
    const t = ts.aging.buckets[b.bucket];
    if (t === undefined) continue;
    const [tu, gu] = [tsUnits(t), goUnits(b.amount)];
    if (tu !== gu) diffs.push(sum(`ember ${b.bucket}: TS ${formatUnits(tu)} ⇄ Go ${formatUnits(gu)}`));
  }
  const [tt, gt] = [tsUnits(ts.aging.total), goUnits(go.total)];
  if (tt !== gt) diffs.push(sum(`total: TS ${formatUnits(tt)} ⇄ Go ${formatUnits(gt)}`));
  if (ts.aging.unresolved !== go.unresolved) {
    diffs.push(`tanpa nilai IDR: TS ${ts.aging.unresolved} ⇄ Go ${go.unresolved}`);
  }
  if (ts.overdueCount !== go.overdueCount) {
    diffs.push(`jatuh tempo: TS ${ts.overdueCount} ⇄ Go ${go.overdueCount}`);
  }
  return diffs;
}
