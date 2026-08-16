/**
 * Grup rute `(docs)` — SATU halaman, DUA kulit.
 *
 * `/docs` tetap PUBLIK. Yang ditambahkan di sini bukan penjaga melainkan satu
 * pertanyaan yang dijawab "kalau ada": adakah sesi? Bila ada, dokumentasi
 * dirender di dalam chrome aplikasi (menu samping + bilah atas + jalan pulang
 * ke buku); bila tidak, kepala publik yang sudah ada sejak #300 — tidak
 * berubah sedikit pun.
 *
 * Keputusan kulit untuk masing-masing dari ketiga keadaan, beserta alasan
 * kenapa keadaan 1 TIDAK memakai kerangka dasbor, ditulis di kepala
 * `src/lib/docs-chrome.tsx`. Bacalah di sana sebelum menukar kulitnya.
 *
 * ══ KENAPA DI LAYOUT, BUKAN DI KEDUA HALAMAN ═══════════════════════════════
 * Tiga sebab, dan yang ketiga yang menentukan:
 *
 *  • chrome memang pekerjaan layout — ia digambar sekali di sekeliling setiap
 *    halaman dokumentasi, termasuk 404 dari `[...slug]`;
 *  • kedua `page.tsx` tetap bersih dari sesi, jadi janji `tests/authz-coverage`
 *    ("halaman di grup ini tidak menyentuh sesi maupun basis data") tetap benar
 *    apa adanya — yang bertambah adalah satu berkas yang BUKAN halaman, dengan
 *    aturannya sendiri;
 *  • dan karena itu tidak ada halaman dokumentasi berikutnya yang bisa lahir
 *    dengan kulit yang salah karena penulisnya lupa memanggil sesuatu.
 *
 * ⚠ Tidak ada penjaga di sini, dan tidak boleh pernah ada. `pembacaDokumentasi()`
 * menjawab `null` alih-alih memantulkan; dijaga `tests/docs.test.ts`.
 */

import { DocsAppChrome } from "@/components/docs/docs-app-chrome";
import { DocsPublicChrome } from "@/components/docs/docs-public-chrome";
import { kulitDokumentasi } from "@/lib/docs-chrome";
import { pembacaDokumentasi } from "@/lib/docs-viewer";
import { getT } from "@/lib/i18n/server";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const pembaca = await pembacaDokumentasi();

  /* Lewat fungsi, bukan lewat `pembaca ? … : …` langsung: keputusannya diuji
     sebagai fungsi murni (ketiga keadaan + keadaan ke-4 di kepala
     `lib/docs-chrome.tsx`), dan cabang yang memutuskan sendiri di sini akan
     membuat uji itu menjadi hiasan. `pembaca &&` di sebelahnya bukan
     pemeriksaan kedua melainkan penyempitan tipe untuk `tsc`. */
  if (kulitDokumentasi(pembaca) === "aplikasi" && pembaca) {
    return (
      <DocsAppChrome pembaca={pembaca} t={t}>
        {children}
      </DocsAppChrome>
    );
  }

  return <DocsPublicChrome t={t}>{children}</DocsPublicChrome>;
}
