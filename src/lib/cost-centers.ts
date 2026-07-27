/**
 * Dimensi pusat biaya — bagian MURNI-nya (issue #91).
 *
 * Tanpa React, tanpa Prisma, tanpa `next` — jadi aman diimpor komponen client
 * (pemilih & penyaring) maupun modul server (laporan, buku besar), dan bisa
 * diuji langsung.
 *
 * ── SATU HAL YANG DIJAGA MODUL INI ──────────────────────────────────────────
 * Ada TIGA keadaan penyaring, dan membedakannya adalah seluruh isi berkas ini:
 *
 *   • tanpa penyaring   → semua baris jurnal (`{}`)
 *   • satu pusat biaya  → `cost_center_id = <id>`
 *   • "belum ditetapkan"→ `cost_center_id IS NULL`
 *
 * Keadaan ketiga itulah yang membuat janji rekonsiliasi bisa ditepati: jumlah
 * seluruh pusat biaya DITAMBAH yang belum ditetapkan harus sama persis dengan
 * total tanpa penyaring (`tests/cost-centre-reconciliation.test.ts`). Kalau
 * "belum ditetapkan" tak bisa dipilih, angka bertag NULL akan lenyap dari
 * setiap pilahan dan dimensinya diam-diam merusak angka alih-alih memilahnya.
 *
 * Dimensi ini menyaring TAMPILAN. Ia tidak pernah menggerbangi buku besar:
 * tidak ada satu pun query tulis yang membacanya, dan data historis (yang
 * seluruhnya bertag NULL) tetap utuh.
 */

/** Nilai URL untuk "belum ditetapkan" — dibedakan dari "tanpa penyaring" (kosong). */
export const UNASSIGNED_COST_CENTER = "unassigned";

/**
 * Penyaring pusat biaya yang sudah dinormalkan.
 * `undefined` = tanpa penyaring · angka = satu pusat biaya · `"unassigned"` = NULL.
 */
export type CostCenterFilter = number | typeof UNASSIGNED_COST_CENTER | undefined;

/**
 * Baca penyaring dari sebuah parameter URL.
 *
 * Apa pun yang tidak masuk akal (kosong, bukan angka, angka ≤ 0) jatuh ke
 * "tanpa penyaring" — laporan yang menampilkan SELURUH angka adalah kegagalan
 * yang aman; yang menampilkan sebagian tanpa mengatakannya tidak.
 */
export function parseCostCenterFilter(raw: string | null | undefined): CostCenterFilter {
  if (raw == null) return undefined;
  const value = raw.trim();
  if (value === "") return undefined;
  if (value === UNASSIGNED_COST_CENTER) return UNASSIGNED_COST_CENTER;
  // Digit saja — `parseInt` sendirian menerima "1.5.2" dan "12abc" sebagai 1
  // dan 12, yaitu menyaring ke pusat biaya yang TIDAK diminta siapa pun.
  if (!/^\d+$/.test(value)) return undefined;
  const id = Number.parseInt(value, 10);
  return id > 0 ? id : undefined;
}

/** Kebalikan `parseCostCenterFilter` — nilai untuk `<select>` & querystring. */
export function costCenterFilterValue(filter: CostCenterFilter): string {
  if (filter === undefined) return "";
  return typeof filter === "number" ? String(filter) : filter;
}

/**
 * Potongan klausa `where` untuk `journal_lines`, siap disebar (`...`) ke dalam
 * query yang sudah ada. Objek KOSONG saat tanpa penyaring — bukan
 * `{ costCenterId: undefined }`, karena `undefined` yang eksplisit adalah cara
 * paling mudah membuat "tanpa penyaring" dan "belum ditetapkan" tertukar.
 */
export function costCenterLineWhere(
  filter: CostCenterFilter
): Record<string, never> | { costCenterId: number | null } {
  if (filter === undefined) return {};
  return { costCenterId: filter === UNASSIGNED_COST_CENTER ? null : filter };
}
