/**
 * Pembanding paritas kesesuaian data — Node ⇄ Go (09 §3.3, 23 Okt 2026).
 *
 * MURNI, sama dengan `trial-balance-parity.ts`: tanpa Prisma, tanpa IO, supaya
 * aturan "apa yang disebut setara" diuji tanpa basis data. Pemakainya
 * `scripts/parity-conformance.ts`.
 *
 * Setara berarti: pemeriksaan yang SAMA berbunyi, dalam URUTAN yang sama,
 * dengan judul yang sama, jumlah baris yang sama, dan kalimat temuan yang
 * sama pada setiap posisi. Bukan himpunan: urutan baris adalah urutan yang
 * dibaca orang di konsol dan di jejak putaran, dan diff antarputaran berhenti
 * berguna begitu urutannya bergantung pada pelaksana.
 */

/** Satu pemeriksaan yang berbunyi di satu buku — bentuk kedua bahasa. */
export interface CheckResult {
  key: string;
  judul: string;
  labels: string[];
}

/** Selisih dua hasil satu buku; kosong = setara. */
export function compareConformance(ts: readonly CheckResult[], go: readonly CheckResult[]): string[] {
  const diffs: string[] = [];
  const kunciTs = ts.map((c) => c.key).join(", ");
  const kunciGo = go.map((c) => c.key).join(", ");
  if (kunciTs !== kunciGo) diffs.push(`pemeriksaan yang berbunyi: TS [${kunciTs}] ≠ Go [${kunciGo}]`);
  for (const t of ts) {
    const g = go.find((x) => x.key === t.key);
    if (!g) continue;
    if (t.judul !== g.judul) {
      diffs.push(`${t.key}: judul TS ${JSON.stringify(t.judul)} ≠ Go ${JSON.stringify(g.judul)}`);
    }
    if (t.labels.length !== g.labels.length) {
      diffs.push(`${t.key}: ${t.labels.length} baris di TS, ${g.labels.length} di Go`);
    }
    const n = Math.max(t.labels.length, g.labels.length);
    for (let i = 0; i < n; i++) {
      if (t.labels[i] !== g.labels[i]) {
        diffs.push(
          `${t.key}[${i}]: TS ${JSON.stringify(t.labels[i] ?? null)} ≠ Go ${JSON.stringify(g.labels[i] ?? null)}`
        );
      }
    }
  }
  return diffs;
}
