/**
 * Pembaca `.xlsx` → matriks sel (server-only, sisi tulis ada di `@/lib/xlsx`).
 *
 * Sengaja tipis: memuat buffer ke ExcelJS dan mengembalikan worksheet pertama
 * sebagai `unknown[][]` mentah. Semua aturan validasi/pemetaan tinggal di modul
 * murni yang menerima matriks ini (mis. `@/lib/coa-import`), agar bisa diuji
 * tanpa ExcelJS. ExcelJS adalah library Node — hanya dipanggil di route API.
 */
import ExcelJS from "exceljs";

/**
 * Baca worksheet pertama menjadi array baris (array sel). Nilai sel dinormalkan
 * ke string/number sederhana; formula/rich-text diringkas ke teksnya.
 */
export async function readFirstSheetRows(buffer: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: unknown[] = [];
    // `row.values` is 1-based (index 0 is empty); flatten to 0-based cells.
    const values = Array.isArray(row.values) ? row.values : [];
    for (let i = 1; i < values.length; i += 1) {
      cells.push(normalizeCell(values[i]));
    }
    rows.push(cells);
  });
  return rows;
}

function normalizeCell(v: unknown): unknown {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  /*
   * Sel bertipe TANGGAL — ExcelJS memulangkannya sebagai `Date`, bukan teks.
   *
   * Tanpa cabang ini ia jatuh ke `String(v)` di bawah dan menjadi
   * "Sat Dec 31 2024 07:00:00 GMT+0700 (Western Indonesia Time)", yang ditolak
   * `parseImportDate` — jadi setiap berkas yang tanggalnya sungguhan tanggal
   * (dan bukan teks) gagal seluruhnya di kolom tanggalnya. Templat kita
   * sendiri menuliskan tanggal sebagai TEKS, itulah sebabnya lubang ini tak
   * pernah terlihat sampai ekspor Accurate masuk.
   *
   * Dibaca dengan penunjuk UTC, bukan lokal: tanggal dokumen adalah tanggal
   * KALENDER, dan zona waktu server tidak boleh menggesernya sehari — aturan
   * yang sama sudah dipegang `parseImportDate`.
   */
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  // Rich text / hyperlink / formula objects → gunakan teks yang terlihat.
  const obj = v as { text?: string; result?: unknown; richText?: { text: string }[] };
  if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join("");
  if (typeof obj.text === "string") return obj.text;
  if (obj.result != null) return obj.result;
  return String(v);
}
