/**
 * Apakah frasa yang diketik ulang sudah cocok dengan yang diminta (issue #6)?
 *
 * Dipakai `ConfirmDialog` untuk menahan tindakan yang TIDAK bisa dibatalkan —
 * menghapus kontrak/faktur beserta pembalikan jurnalnya. Gunanya bukan menguji
 * ketelitian mengetik, melainkan memaksa pengguna membaca nomor dokumen yang
 * sedang dihapus; karena itu spasi di ujung diabaikan dan huruf besar/kecil
 * tidak dibedakan. Frasa kosong berarti "tanpa gesekan tambahan".
 *
 * Tinggal di modul murni sendiri, bukan di dalam komponennya, supaya aturan
 * pencocokannya bisa diuji tanpa DOM.
 */
export function matchesConfirmPhrase(typed: string, phrase?: string | null): boolean {
  if (!phrase) return true;
  return typed.trim().toLowerCase() === phrase.trim().toLowerCase();
}
