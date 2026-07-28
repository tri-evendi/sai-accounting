/**
 * Bagan akun yang MENGIKUTI MODUL — sengaja BUKAN di `accounting.ts`.
 *
 * ══ KENAPA BERKAS TERSENDIRI ═══════════════════════════════════════════════
 * `tests/business-modules-ledger.test.ts` melarang mesin buku besar (laporan,
 * jurnal, posting, saldo awal) menjangkau `business-modules.ts` lewat jalur
 * impor mana pun. Aturan itu bukan kerapian: kalau angka laporan bisa berubah
 * mengikuti modul yang menyala, mematikan sebuah modul berhenti menjadi tombol
 * fitur dan menjadi bug integritas akuntansi.
 *
 * `accounting.ts` termasuk yang dijangkau mesin itu (lewat `reports.ts` dan
 * `budget-report.ts`), jadi ia tidak boleh tahu apa pun tentang modul —
 * bahkan lewat impor TIPE saja, sebab penjaganya menelusuri jalur impor, bukan
 * niat. Karena itu `COA_TEMPLATE` hanya membawa `module?: string`, dan
 * penerjemahannya menjadi himpunan modul tinggal di sini: berkas yang hanya
 * dipakai jalur PENYIAPAN, tidak pernah oleh jalur perhitungan.
 *
 * Kesahihan nilai tag-nya tetap dijaga — lihat `tests/coa-template-modules.test.ts`.
 */
import { COA_TEMPLATE, type CoaTemplateRow } from "@/lib/accounting";
import type { BusinessModule } from "@/lib/business-modules";

/**
 * Bagan akun untuk HIMPUNAN MODUL yang benar-benar dipakai perusahaan
 * (issue #99/#104).
 *
 * Sebelum ini setiap perusahaan disemai template yang sama persis — sehingga
 * perusahaan JASA, yang modul persediaannya memang sudah dimatikan kategori
 * usahanya, tetap mendapat "Persediaan Barang Dagang", "Beban Pokok
 * Penjualan", dan "Selisih Persediaan". Akun-akun itu tidak pernah terpakai,
 * tapi ikut memenuhi setiap pemilih akun, setiap laporan, dan setiap ekspor —
 * persis kebalikan dari "permukaan sederhana" yang dijanjikan aplikasi ini.
 *
 * Baris tanpa `module` selalu ikut: modal, laba ditahan, beban operasional,
 * selisih kurs, dan bunga/administrasi bank tidak dimiliki modul mana pun —
 * mereka milik pembukuan itu sendiri.
 *
 * INDUK IKUT SERTA meski induknya sendiri bertanda modul lain: akun anak tanpa
 * induk akan gagal disemai (relasi `parent`), jadi induk yang dibutuhkan
 * ditarik masuk. Yang tidak dibutuhkan siapa pun tetap ditinggal.
 */
export function coaTemplateFor(modules: Iterable<BusinessModule>): CoaTemplateRow[] {
  const enabled = new Set<string>(modules);
  const wanted = COA_TEMPLATE.filter((row) => !row.module || enabled.has(row.module));

  const byCode = new Map(COA_TEMPLATE.map((row) => [row.code, row]));
  const chosen = new Map(wanted.map((row) => [row.code, row]));
  for (const row of wanted) {
    let parent = row.parent;
    while (parent && !chosen.has(parent)) {
      const parentRow = byCode.get(parent);
      if (!parentRow) break;
      chosen.set(parentRow.code, parentRow);
      parent = parentRow.parent;
    }
  }

  // Urutan template dipertahankan: induk selalu mendahului anaknya di sana,
  // dan penyemaian bergantung pada urutan itu.
  return COA_TEMPLATE.filter((row) => chosen.has(row.code));
}
