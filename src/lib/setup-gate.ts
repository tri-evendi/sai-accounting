/**
 * Gerbang "aplikasi belum disiapkan".
 *
 * Wizard setup (issue #20) sudah lama ada di `/setup`, dan `isSetupComplete()`
 * sudah lama ada di `lib/opening-balance.ts` — tapi **tidak pernah dipanggil
 * siapa pun**. Akibatnya pemasangan baru bisa dipakai tanpa pernah mengisi
 * identitas perusahaan: pengguna log in, mendarat di beranda, dan tidak ada
 * apa pun yang memberi tahu bahwa wizard-nya belum dijalankan. Wizard hanya
 * satu entri menu di antara banyak entri lain.
 *
 * Sejak identitas perusahaan dibaca dari basis data, celah itu jadi lebih
 * mahal: tanpa baris `CompanySetting`, nama yang tercetak jatuh ke nilai
 * cadangan — benar untuk pemasang pertama, dan **diam-diam salah** untuk
 * perusahaan lain. Tidak ada yang rusak, tidak ada galat; fakturnya saja
 * membawa nama yang keliru.
 *
 * Gerbang ini dipasang di `requirePagePermission()` — satu-satunya chokepoint
 * yang sudah dilewati SETIAP halaman dashboard (dijaga
 * `tests/authz-coverage.test.ts`), jadi satu tempat menutup ~50 halaman.
 *
 * SENGAJA BUKAN di `proxy.ts`: sejak issue #73 proxy bersifat autentikasi saja
 * dan tidak menyentuh basis data. Menaruhnya di sana berarti satu query per
 * permintaan, persis alasan yang dulu membuat matriks izin dikeluarkan dari
 * proxy.
 */
import "server-only";

import { isSetupComplete } from "@/lib/opening-balance";
import { currentCompanyId } from "@/lib/current-company";

/**
 * Latch: `isSetup` adalah bendera sekali-jalan (skema menyebutnya "run-once
 * flag"; wizard menolak dijalankan dua kali). Nilainya hanya bisa berpindah
 * false → true, tidak pernah sebaliknya.
 *
 * Karena itu begitu kita pernah melihat `true`, jawabannya boleh disimpan
 * selamanya: dalam keadaan normal — yaitu sepanjang umur pemasangan setelah
 * wizard selesai — gerbang ini **tidak melakukan query sama sekali**. Query
 * hanya terjadi selama jendela singkat sebelum setup dijalankan.
 *
 * Cache per-proses sudah cukup: beberapa container yang masing-masing
 * menyalakan latch-nya sendiri tetap konsisten, sebab arahnya satu arah.
 *
 * Sejak issue #104 latch-nya DIKUNCI PER PERUSAHAAN: satu proses melayani
 * beberapa PT bergantian, dan PT yang wizard-nya sudah selesai tidak boleh
 * membukakan gerbang untuk PT baru yang belum diisi apa pun — persis pemasangan
 * yang paling membutuhkan gerbang ini.
 */
const completedCompanies = new Set<number>();

/** Buang latch — hanya untuk tes. */
export function resetSetupLatchForTests() {
  completedCompanies.clear();
}

/**
 * Apakah wizard setup sudah selesai?
 *
 * **Fail-open**: bila basis data tak terjangkau, jawabannya `true` (anggap
 * sudah disiapkan). Alasannya, kegagalan DB bukan sinyal "belum disiapkan" —
 * dan melempar seluruh pengguna ke layar "belum disiapkan" saat DB sedang
 * bermasalah hanya menyembunyikan galat yang sebenarnya di balik pesan yang
 * salah. Kalau DB memang mati, halaman berikutnya akan gagal dengan pesan yang
 * jauh lebih jujur.
 */
export async function isSetupDone(): Promise<boolean> {
  const companyId = await currentCompanyId();
  if (completedCompanies.has(companyId)) return true;

  try {
    const done = await isSetupComplete();
    if (done) completedCompanies.add(companyId);
    return done;
  } catch {
    return true;
  }
}
