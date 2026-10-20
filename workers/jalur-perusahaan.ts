/**
 * MASUK KE BUKU SATU PT dari dalam sebuah pekerjaan — satu tempat, satu aturan.
 *
 * ══ KENAPA INI DIANGKAT KELUAR DARI `ledger.ts` ════════════════════════════
 * Langkah ini sudah ada sekali di jalur `ledger`, dan tahap 1c menambah jalur
 * kedua yang membutuhkannya persis sama (`interactive`). Dua salinan akan
 * menyimpang pada perbaikan berikutnya, dan yang disimpangkan di sini adalah
 * aturan multi-perusahaan yang paling mahal bila dilanggar:
 *
 * > Konteks perusahaan yang hilang harus MELEMPAR, tidak pernah jatuh ke basis
 * > data bawaan — jatuh ke bawaan berarti transaksi PT A tertulis ke buku PT B
 * > tanpa galat dan tanpa jejak (#104).
 *
 * ══ REGISTRY DIBACA ULANG, MUATAN TIDAK DIPERCAYA ══════════════════════════
 * `slug` dan `databaseName` dibaca dari basis data KENDALI, tidak pernah dari
 * muatan pekerjaan. Muatan datang dari penerbit dan bisa BASI: perusahaan yang
 * slug-nya berubah, yang dinonaktifkan, atau yang sudah dihapus di antara
 * penerbitan dan pelaksanaan tidak boleh menentukan ke basis data mana
 * pekerjaan ini membaca atau menulis.
 */
import { controlDb } from "@sai/core/control-db";

import { runWithCompany } from "../src/lib/company-context";

/**
 * Jalankan `fn` di dalam konteks perusahaan `companyId`.
 *
 * @param companyId id perusahaan dari baris `jobs` (atau muatannya).
 * @param tolakNonaktif apakah perusahaan nonaktif menggagalkan pekerjaan.
 *
 * `tolakNonaktif` ADA karena jawabannya berbeda per jalur, dan bedanya bukan
 * selera: jalur `ledger` MENULIS buku, jadi perusahaan nonaktif harus menolak —
 * nonaktif berarti "tidak bisa dibuka", dan memposting ke buku yang tidak bisa
 * dibuka adalah angka yang tidak akan dilihat siapa pun sampai ia dibuka lagi.
 * Jalur `interactive` hanya MEMBACA, dan ekspor atas buku nonaktif adalah
 * permintaan yang sah — justru itu yang dilakukan orang sebelum mengarsipkan
 * sebuah PT.
 */
export async function dalamKonteksPerusahaan<T>(
  companyId: unknown,
  tolakNonaktif: boolean,
  fn: () => Promise<T>
): Promise<T> {
  if (typeof companyId !== "number" || !Number.isInteger(companyId) || companyId <= 0) {
    throw new Error(
      "pekerjaan tanpa `companyId` yang sah — ia tidak bisa tahu buku mana. " +
        "Konteks perusahaan yang hilang harus MELEMPAR (#104)."
    );
  }

  const company = await controlDb.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, databaseName: true, isActive: true },
  });
  if (!company) {
    throw new Error(
      `perusahaan #${companyId} tidak ada di registry kendali — pekerjaan ini ` +
        "TIDAK dijalankan. Konteks perusahaan yang hilang harus melempar, dan " +
        "tidak pernah jatuh ke basis data bawaan (#104)."
    );
  }
  if (tolakNonaktif && !company.isActive) {
    throw new Error(`perusahaan #${companyId} (${company.slug}) nonaktif — tidak dikerjakan`);
  }

  return runWithCompany(
    { companyId: company.id, slug: company.slug, databaseName: company.databaseName },
    fn
  );
}
