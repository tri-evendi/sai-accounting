/**
 * Versi dokumen hukum (issue #142) — SATU sumber untuk versi S&K dan kebijakan
 * privasi yang sedang berlaku.
 *
 * ══ KENAPA VERSI, BUKAN SEKADAR STEMPEL WAKTU ═══════════════════════════════
 * "Pengguna menyetujui S&K pada tanggal X" tidak membuktikan apa-apa begitu
 * dokumennya berubah: setuju pada APA? Setiap penerimaan karena itu dicatat
 * BESERTA versi dokumen yang tampil saat itu (`registrations.terms_version` /
 * `privacy_version`, dan jejak audit `tenant.register`). Mengubah isi dokumen
 * WAJIB menaikkan versinya di sini — dan pengguna lama TIDAK otomatis
 * dianggap menyetujui versi baru (alur persetujuan-ulang belum ada; catatan
 * di docs/COMPLIANCE.md).
 *
 * Format versi: tanggal terbit + penanda status. Akhiran `-draf` berarti
 * dokumennya BELUM ditinjau penasihat hukum (halamannya pun berspanduk DRAF);
 * versi rilis pertama yang sah menanggalkan akhiran itu.
 */

export const TERMS_VERSION = "2026-08-01-draf";
export const PRIVACY_VERSION = "2026-08-01-draf";

/** Dokumen masih draf? Dipakai spanduk peringatan di halamannya. */
export function isDraftLegalVersion(version: string): boolean {
  return version.endsWith("-draf");
}
