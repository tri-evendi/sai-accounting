/**
 * `fetch()` yang MENYEBUTKAN perusahaannya (issue #158).
 *
 * ══ SATU TEMPAT, BUKAN 67 ══════════════════════════════════════════════════
 * Ada 67 pemanggilan `fetch("/api/…")` tersebar di 49 berkas. Menyuruh
 * masing-masing "jangan lupa kirim perusahaannya" berarti 67 kesempatan untuk
 * lupa — dan yang terlupa tidak akan bersuara selama penjaga masih punya sesi
 * untuk dijadikan tebakan. Karena itu penyuntikannya ada DI SINI, di satu
 * fungsi, dan sesi tidak lagi menjadi tebakan yang tersedia: permintaan tanpa
 * lingkup DITOLAK (409), tidak dilayani dengan perusahaan lain.
 *
 * ══ SUMBER SLUG: ALAMAT YANG SEDANG DIBUKA, BUKAN SESI ═════════════════════
 * Slug dibaca dari `window.location.pathname` — sama seperti `Link`/`useAppRouter`
 * (lihat `components/ui/app-link.tsx`), dan karena alasan yang sama: cookie sesi
 * dibagi SELURUH TAB. Tab yang membuka PT A akan menyusun permintaannya ke PT B
 * beberapa saat setelah tab sebelah berpindah. Membaca alamat berarti setiap tab
 * menjawab untuk dirinya sendiri, dan dua tab pada dua perusahaan tidak lagi
 * bisa saling menulisi buku.
 *
 * Dibaca SETIAP panggilan (bukan sekali saat komponen dipasang): navigasi klien
 * mengganti alamat tanpa memuat ulang apa pun, jadi nilai yang ditangkap sekali
 * di awal adalah nilai yang bisa basi tepat ketika ia dipakai.
 *
 * ══ DI LUAR JALUR BERTENANT ════════════════════════════════════════════════
 * Halaman masuk, `/select-company`, permukaan tenant (`/companies/new`,
 * `/tenant/…`) tidak punya slug di alamatnya — di sana tidak ada header yang
 * ditambahkan, dan itu BENAR: route yang dipanggil dari sana memang route
 * tingkat tenant atau route publik yang sengaja bekerja tanpa perusahaan
 * (lihat `TENANT_API_ROUTES` & `API_EXCEPTIONS` di tests/authz-coverage).
 * Jadi `apiFetch` aman dipakai di mana pun; ia tidak pernah mengarang lingkup.
 */

import { COMPANY_SLUG_HEADER, TENANT_SLUG_HEADER } from "@/lib/company-scope";
import { parseTenantPath } from "@/lib/tenant-routes";

/**
 * Salin `init` sambil menambahkan sepasang header lingkup bila `pathname`
 * memang bertenant. MURNI — bisa diuji tanpa `window`, tanpa jaringan.
 *
 * `Headers` disusun dari `init.headers` yang ada, jadi `Content-Type` yang
 * ditulis pemanggil tetap utuh; badan `FormData` yang sengaja TIDAK
 * ber-`Content-Type` (batas multipart-nya disusun browser) juga tidak
 * tersentuh — kita tidak pernah menambahkan header itu.
 */
export function withCompanyScope(
  init: RequestInit | undefined,
  pathname: string | null | undefined
): RequestInit | undefined {
  const scope = pathname ? parseTenantPath(pathname) : null;
  if (!scope) return init;

  const headers = new Headers(init?.headers);
  headers.set(TENANT_SLUG_HEADER, scope.tenantSlug);
  headers.set(COMPANY_SLUG_HEADER, scope.companySlug);
  return { ...init, headers };
}

/**
 * Pengganti `fetch` untuk SETIAP panggilan ke `/api/…` dari kode aplikasi.
 *
 * Sengaja bukan hook: sebagian besar pemanggilnya adalah penangan kejadian
 * (`onSubmit`, `onClick`) dan fungsi pembantu di luar komponen, dan sebuah hook
 * akan memaksa semuanya ditulis ulang menjadi komponen. `window.location` sudah
 * merupakan sumber yang sama dengan `usePathname()` — hanya tanpa syarat harus
 * berada di dalam render.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const pathname = typeof window === "undefined" ? null : window.location.pathname;
  return fetch(input, withCompanyScope(init, pathname));
}
