/**
 * Serialisasi CSV untuk ekspor data mandiri (issue #142) — MURNI, diuji di
 * `tests/tenant-export.test.ts`.
 *
 * CSV dipilih karena syarat hukumnya "bisa dibuka TANPA aplikasi ini": Excel,
 * LibreOffice, bahkan editor teks membacanya. RFC 4180: koma sebagai pemisah,
 * nilai yang memuat koma/kutip/baris-baru dibungkus kutip ganda, kutip di
 * dalamnya digandakan.
 */

/** Satu nilai sel → teks CSV. Bentuk tanggal ISO-8601; Decimal (objek Prisma)
 *  memakai `toString`-nya — angka uang TIDAK pernah lewat float. */
export function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "1" : "0";
  /* `Uint8Array`, BUKAN hanya `Buffer`: `@prisma/adapter-pg` memulangkan
     `bytea` sebagai `Uint8Array` polos (diukur 23 Okt 2026), dan
     `Buffer.isBuffer` menolaknya — sampai saat itu setiap logo perusahaan
     (`company_logos.content`) terekspor sebagai daftar desimal
     "137,80,78,…" alih-alih base64 yang dijanjikan baris ini. `Buffer`
     sendiri turunan `Uint8Array`, jadi keduanya tertangkap. Padanan Go:
     `byteaBase64` di `internal/tenantexport`. */
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
  }
  return String(value);
}

/** Escape RFC 4180 — hanya bila perlu, supaya berkasnya tetap enak dibaca. */
export function csvEscape(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Baris-baris (header + data) → satu dokumen CSV ber-BOM: tanpa BOM, Excel
 *  versi Indonesia menebak encoding dan merusak setiap huruf non-ASCII. */
export function toCsv(header: readonly string[], rows: readonly unknown[][]): string {
  const lines = [header.map((h) => csvEscape(h)).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => csvEscape(csvValue(cell))).join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
