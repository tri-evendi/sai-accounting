"use client";

/**
 * `<Link>` yang tahu perusahaan mana yang sedang dibuka (issue #157).
 *
 * ══ MASALAHNYA: 114 TAUTAN, SATU BENTUK JALUR YANG BERUBAH ═════════════════
 * Setelah halaman pindah ke `/t/{tenant}/{company}/…`, setiap `href="/invoices"`
 * di seluruh aplikasi menunjuk jalur LAMA. Semuanya masih bekerja — `proxy.ts`
 * memantulkannya 307 ke jalur kanonik — tapi "masih bekerja" bukan tujuannya:
 * pantulan menambah satu perjalanan bolak-balik pada setiap klik, dan sekejap
 * memperlihatkan URL yang bukan alamat sebenarnya (yang lalu ikut tersalin
 * kalau orang menyalin tautannya saat itu juga).
 *
 * Menulis ulang 114 tempat satu per satu berarti 114 kesempatan untuk lupa —
 * dan yang terlupa tidak akan pernah bersuara, sebab pantulannya menutupi.
 * Karena itu perbaikannya dipasang di SATU tempat: komponen ini menggantikan
 * `next/link` di dalam aplikasi, dan setiap tautan lama ikut benar tanpa
 * disentuh.
 *
 * ══ SUMBER SLUG: JALUR, BUKAN SESI ═════════════════════════════════════════
 * Slug dibaca dari `usePathname()` — alamat yang SEDANG dibuka — bukan dari
 * `useSession()`. Bedanya menentukan: sesi dibagi seluruh tab, jadi tab yang
 * membuka PT A akan menyusun tautannya ke PT B beberapa saat setelah tab
 * sebelah berpindah. Itu persis kelas kegagalan yang issue ini hapus; memakai
 * sesi di sini berarti memasangnya kembali lewat pintu belakang.
 *
 * Di luar jalur bertenant (halaman masuk, konsol operator, halaman dashboard
 * yang belum dimigrasikan) `usePathname()` tidak memberi slug apa pun dan
 * komponen ini meneruskan `href` apa adanya — jadi ia aman dipakai di mana pun,
 * termasuk selama masa migrasi bertahap ketika sebagian halaman masih di jalur
 * lama.
 */

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ComponentProps } from "react";

import { legacyTenantScopedPath, parseTenantPath, tenantPath } from "@/lib/tenant-routes";

export type AppLinkProps = ComponentProps<typeof NextLink>;

/**
 * Petakan satu `href` ke jalur kanonik bila (a) kita sedang berada di jalur
 * bertenant dan (b) segmen tujuannya memang sudah dimigrasikan. Murni, jadi
 * bisa diuji tanpa merender apa pun.
 */
export function scopedHref(href: string, pathname: string | null): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const scope = pathname ? parseTenantPath(pathname) : null;
  if (!scope) return href;
  // Querystring & fragment tidak ikut menentukan segmen tujuan.
  const bare = href.split(/[?#]/)[0];
  if (!legacyTenantScopedPath(bare)) return href;
  return tenantPath(scope.tenantSlug, scope.companySlug, href);
}

/* ══ Semantik `next/link` untuk elemen yang BUKAN `<Link>` (issue #289) ══════
 *
 * `<ButtonLink>` merender `<a class="ant-btn">` milik AntD — satu elemen, rupa
 * tombol, tanpa satu pun nama kelas yang disalin. Harganya: `next/link` tidak
 * ikut, jadi dua hal yang biasa ia berikan harus dipasang dari luar. Keduanya
 * hidup DI SINI, bukan di `ui/button.tsx`, karena keduanya pengetahuan tentang
 * `next/link` — sama seperti `scopedHref` di atas — dan karena begitu keduanya
 * bisa diuji sebagai fungsi, bukan lewat sebuah komponen yang perlu DOM.
 *
 * Rujukannya `next/link` versi terpasang (`client/app-dir/link.js`:
 * `isModifiedEvent` + `linkClicked`), disempitkan ke bentuk yang app ini pakai.
 */

/**
 * Apakah TAUTANNYA boleh dicegat menjadi navigasi sisi-klien — pertanyaan
 * statis, dijawab dari sifat tautannya saja.
 *
 * Ketiga sebab di bawah harus tetap jatuh ke peramban, dan ketiganya pernah
 * jadi bug di aplikasi nyata:
 *  • `download` — dicegat berarti berkasnya tidak pernah terunduh dan yang
 *    terjadi malah pindah halaman;
 *  • `target` selain `_self` — dicegat berarti "buka di tab baru" membuka di
 *    tab yang sama;
 *  • alamat luar / protokol lain (`https:`, `mailto:`, `//host`) — router hanya
 *    mengerti rute app ini.
 */
export function tautanDicegat(
  href: string,
  opsi: { target?: string; download?: unknown } = {}
): boolean {
  // `download={false}` berarti "bukan unduhan" — React pun tidak menuliskannya
  // ke DOM, jadi memperlakukannya sebagai unduhan akan mematikan navigasi
  // sisi-klien pada tautan yang justru menyatakan dirinya bukan unduhan.
  if (opsi.download !== undefined && opsi.download !== false) return false;
  if (opsi.target !== undefined && opsi.target !== "_self") return false;
  return href.startsWith("/") && !href.startsWith("//");
}

/** Bentuk minimum kejadian klik yang dibutuhkan `klikBiasa`. */
export type KlikTautan = Pick<
  MouseEvent,
  "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

/**
 * Apakah KEJADIANNYA klik biasa — kiri, tanpa modifier.
 *
 * Yang tidak dicegat di sini bukan kekurangan melainkan seluruh alasan bentuk
 * `<a href>` dipilih: Ctrl/Cmd-klik, Shift-klik, dan klik tengah tetap membuka
 * tab atau jendela baru, dan mereka bekerja justru karena kita membiarkannya.
 * Tombol dengan `onClick` yang menavigasi kehilangan semua itu tanpa bisa
 * menggantinya.
 */
export function klikBiasa(e: KlikTautan): boolean {
  if (e.button !== 0) return false;
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
}

/**
 * Jalankan `sekali` saat `el` pertama kali terlihat, lalu berhenti mengamati —
 * pengganti prefetch-saat-masuk-viewport milik `next/link`.
 *
 * Sekali saja, dan itu disengaja: hasilnya sudah masuk cache router, jadi
 * mengulanginya setiap kali tautannya lewat layar hanya menambah permintaan.
 * (`next/link` memang memperbarui yang sudah basi lewat `mountLinkInstance`,
 * internal yang tidak punya API publik — lihat kepala `ui/button.tsx`.)
 *
 * Mengembalikan pembersih, atau `undefined` bila lingkungannya tidak punya
 * `IntersectionObserver` (SSR, atau peramban lama): di situ prefetch memang
 * tidak terjadi, dan tautannya tetap berfungsi penuh.
 */
export function amatiSekaliSaatTerlihat(
  el: Element | null,
  sekali: () => void
): (() => void) | undefined {
  if (!el || typeof IntersectionObserver === "undefined") return undefined;
  /*
   * `disconnect()` saja tidak cukup untuk menjamin "sekali": ia menghentikan
   * pengamatan BERIKUTNYA, bukan panggilan balik yang sudah dijadwalkan. Bendera
   * ini yang membuat jaminannya milik fungsi ini sendiri, bukan milik perilaku
   * `IntersectionObserver` yang kebetulan.
   */
  let sudah = false;
  const pengamat = new IntersectionObserver((entries) => {
    if (sudah || !entries.some((entri) => entri.isIntersecting)) return;
    sudah = true;
    pengamat.disconnect();
    sekali();
  });
  pengamat.observe(el);
  return () => pengamat.disconnect();
}

export function Link({ href, ...props }: AppLinkProps) {
  const pathname = usePathname();
  /*
   * `href` boleh berupa `UrlObject`, dan bentuk itu sengaja TIDAK disentuh:
   * ia hampir tidak dipakai di aplikasi ini, dan menebak-nebak isinya lebih
   * berisiko daripada membiarkan pantulan proxy menanganinya.
   */
  const next = typeof href === "string" ? scopedHref(href, pathname) : href;
  return <NextLink href={next} {...props} />;
}

export default Link;

/**
 * Pasangan `Link` untuk navigasi PROGRAMATIK — formulir yang pulang ke daftar
 * setelah menyimpan (`router.push("/invoices")` dan 21 saudaranya).
 *
 * Ada karena alasan yang sama: satu tempat, bukan 22. Dan lebih penting di sini
 * daripada di tautan biasa — perpindahan setelah menyimpan terjadi tepat ketika
 * pengguna paling perlu melihat HASIL simpanannya; pantulan 307 di saat itu
 * membuang cache render dan memunculkan kembali daftar yang baru saja dimuat.
 *
 * Metode selain `push`/`replace` diteruskan apa adanya: `refresh`, `back`,
 * `forward`, dan `prefetch` tidak menerima jalur atau tidak mengubah alamat.
 */
export function useAppRouter() {
  const router = useRouter();
  const pathname = usePathname();

  return useMemo(
    () => ({
      push: (href: string) => router.push(scopedHref(href, pathname)),
      replace: (href: string) => router.replace(scopedHref(href, pathname)),
      prefetch: (href: string) => router.prefetch(scopedHref(href, pathname)),
      refresh: () => router.refresh(),
      back: () => router.back(),
      forward: () => router.forward(),
    }),
    [router, pathname]
  );
}
