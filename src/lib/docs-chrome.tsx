/**
 * KULIT MANA yang membungkus `/docs` — keputusannya, dipisahkan dari gambarnya.
 *
 * ══ MASALAHNYA ═════════════════════════════════════════════════════════════
 * `/docs` selalu memakai kepala publik yang ramping, TERMASUK untuk orang yang
 * sedang bersesi. Pintu masuk yang paling sering dipakai justru dari DALAM
 * aplikasi (menu Bantuan di bilah atas, `components/layout/help-menu.tsx`),
 * jadi satu klik "Panduan halaman ini" melempar pengguna keluar dari chrome-nya
 * ke halaman telanjang — tanpa menu samping, tanpa bilah atas, tanpa jalan
 * kembali selain tombol Back peramban. Kelas cacat yang sama sudah diperbaiki
 * dua kali: `/companies/new` (dulu `AuthShell` bergaya login padahal dibuka
 * dari panel akun) dan wisaya penyiapan (dulu `SetupShell`-nya sendiri).
 *
 * ══ TIGA KEADAAN, DAN KULIT UNTUK MASING-MASING ════════════════════════════
 *
 *  1. **bersesi, dengan PT terbuka**  → kulit APLIKASI (`PlatformShell`)
 *  2. **bersesi, tanpa satu pun PT**  → kulit APLIKASI (`PlatformShell`)
 *  3. **tanpa sesi**                  → kulit PUBLIK, tidak berubah sedikit pun
 *
 * ⚠ Keadaan ke-4 yang mudah terlewat: bersesi tetapi TANPA keanggotaan tenant
 * (sisa masa adopsi #134). `PlatformShell` menuntut nama tenant sebagai
 * orientasi "akun siapa", dan menebaknya berarti memajang nama yang salah di
 * bilah atas. Keadaan itu karena itu turun ke kulit PUBLIK — halamannya tetap
 * terbaca, yang hilang hanya chrome-nya.
 *
 * ══ KENAPA BUKAN KERANGKA DASBOR UNTUK KEADAAN 1 ═══════════════════════════
 * Permintaan aslinya menyebut "kerangka dasbor" untuk pembaca yang punya PT
 * terbuka, dan itu ditolak dengan dua ukuran — bukan dengan selera:
 *
 *  • **Ia tidak bisa menjawab keadaan 2 sama sekali.** `(dashboard)/layout.tsx`
 *    menyusun menunya dari `session.user.role`, yaitu PERAN DI SEBUAH PT, dan
 *    ketika peran itu `null` ia harfiah `return <PageLoader …>` — selamanya.
 *    Pemilik tenant baru yang membuka dokumentasi akan melihat pemutar memuat,
 *    bukan halaman. Alasan yang sama persis sudah ditulis di kepala
 *    `components/tenant/platform-shell.tsx` dan `(tenant)/layout.tsx`.
 *  • **Menunya akan memantul.** Ke-±40 butir menu samping dasbor beralamat
 *    JALUR APLIKASI (`/invoices`, `/dashboard`), dan yang menerjemahkannya ke
 *    jalur kanonik `/t/{tenant}/{company}/…` adalah `scopedHref` di
 *    `ui/app-link.tsx` — yang membaca slug dari `usePathname()`, ALAMAT YANG
 *    SEDANG DIBUKA. Di `/docs` tidak ada slug di alamatnya, jadi setiap butir
 *    akan menunjuk jalur lama dan mengandalkan pantulan 307 proxy; dan tidak
 *    satu butir pun akan bertanda aktif.
 *
 * Jadi memakai kerangka dasbor berarti tiga kulit (dasbor / panel / publik)
 * yang salah satunya rusak di separuh keadaannya. `PlatformShell` menjawab
 * keadaan 1 dan 2 dengan bentuk yang sama — menu samping gelap, bilah atas,
 * menu akun berisi jalan keluar — dan menunya DIOPER, bukan dihitung dari
 * peran di sebuah PT. Yang hilang dibanding kerangka dasbor adalah menu ±40
 * butir modul; yang menggantikannya butir pertama di bawah, yang memulangkan
 * pembaca tepat ke buku yang sedang ia buka.
 *
 * ⚠ Konsekuensi yang harus diketahui: `PlatformShell` memasang `data-platform`,
 * akar NADA `/platform` (#303). Dokumentasi karena itu ikut memakai nada panel
 * akun saat dibaca dari dalam aplikasi. Itu diterima dengan sadar — nada itu
 * hanya mendeklarasikan variabel chip di dalam selektornya, dan kolom bacanya
 * sendiri tidak memakai satu pun di antaranya.
 */

import { BookOutlined } from "@ant-design/icons";

import type { PlatformNavItem } from "@/components/tenant/platform-shell";
import type { TranslateFn } from "@/lib/i18n/client";
import { panelNav } from "@/lib/panel-nav";
import { COMPANY_HOME_PATH, tenantPath } from "@/lib/tenant-routes";

/** Kulit yang membungkus kolom baca. Dua, tidak pernah tiga. */
export type KulitDokumentasi = "publik" | "aplikasi";

/**
 * Yang dibutuhkan kulit aplikasi, dan TIDAK lebih.
 *
 * Semuanya berasal dari sesi + satu baris keanggotaan tenant di basis data
 * KENDALI; tidak satu pun menuntut konteks perusahaan. Itu syarat mati di sini:
 * `/docs` wajib tetap terbaca oleh pemilik tenant yang belum punya satu pun PT,
 * dan `docs/MULTI-COMPANY.md` menuntut konteks perusahaan yang hilang MELEMPAR
 * — jadi permukaan ini tidak boleh pernah memintanya.
 */
export interface PembacaDokumentasi {
  /** Nama tenant — orientasi "akun siapa" di bilah atas. */
  tenantName: string;
  /** Peran TENANT (owner/admin/member), bukan peran akuntansi di sebuah PT. */
  tenantRole: string | null;
  userName: string;
  /**
   * Buku yang sedang terbuka, atau `null` bagi pemilik tenant tanpa satu pun
   * PT. `null` di sini BUKAN kegagalan — ia keadaan 2 di kepala berkas.
   */
  buku: { tenantSlug: string; companySlug: string } | null;
}

/**
 * Keputusannya, sebagai fungsi murni supaya ketiga keadaan bisa dinyatakan
 * sebagai uji dan bukan sebagai cabang yang kebetulan benar.
 *
 * `null` berarti "tidak ada pembaca yang bisa kita namai" — tanpa sesi, atau
 * bersesi tanpa keanggotaan tenant. Keduanya dijawab kulit publik.
 */
export function kulitDokumentasi(pembaca: PembacaDokumentasi | null): KulitDokumentasi {
  return pembaca === null ? "publik" : "aplikasi";
}

/**
 * Menu samping untuk kulit aplikasi.
 *
 * Butir pertama adalah JALAN KEMBALI, dan ia satu-satunya alasan berkas ini
 * tidak cukup memanggil `panelNav` apa adanya: pembaca yang datang dari menu
 * Bantuan sedang berada di tengah pekerjaan di sebuah buku, dan yang ia
 * butuhkan pertama-tama adalah pintu pulang ke buku itu — bukan ke panel akun.
 * Alamatnya dirakit `tenantPath`, jadi ia jalur KANONIK sejak klik pertama
 * (tanpa pantulan 307) meski halaman ini berdiri di luar jalur bertenant.
 *
 * Sisanya `panelNav` — SATU tempat yang menyusun menu panel akun dari matriks
 * izin, dipakai `(tenant)/(panel)/layout.tsx` dan `(setup)/layout.tsx`.
 * Menyalinnya ke sini akan menaruh keputusan "siapa melihat apa" di tempat
 * ketiga yang tidak diuji siapa pun.
 *
 * ⚠ Daftarnya TIDAK PERNAH kosong: butir `/platform` di `panelNav` tidak
 * bersyarat izin apa pun. Menu kosong yang setiap butirnya memantul adalah
 * kegagalan yang keadaan 2 paling mudah menghasilkannya, dan
 * `tests/docs-chrome.test.tsx` menguncinya.
 */
export function navDokumentasi(pembaca: PembacaDokumentasi, t: TranslateFn): PlatformNavItem[] {
  const pulang: PlatformNavItem[] = pembaca.buku
    ? [
        {
          href: tenantPath(pembaca.buku.tenantSlug, pembaca.buku.companySlug, COMPANY_HOME_PATH),
          label: t("docs.backToBook"),
          icon: <BookOutlined style={{ fontSize: 16 }} />,
          /* PERSIS: akar perusahaan adalah awalan dari SETIAP halamannya, jadi
             tanpa ini butir ini menyala di mana-mana. */
          exact: true,
        },
      ]
    : [];

  return [...pulang, ...panelNav({ role: pembaca.tenantRole }, t)];
}
