"use client";

/**
 * Pagination — kendali halaman untuk daftar yang DIPAGINASI DI SERVER
 * (ditulis ulang di atas Ant Design `Pagination`, issue #189).
 *
 * ── Yang tidak boleh hilang dalam perpindahan ini ──────────────────────────
 * Sebelum #189 berkas ini adalah server component yang merender `<Link>`
 * biasa. Dua belas halaman daftar memakainya, dan semuanya mengambil datanya
 * di server berdasarkan `?page=`. Yang dibawa `<Link>` di sana bukan gaya:
 *
 *   • URL setiap halaman bisa DISALIN, ditandai, dan dibuka di tab baru;
 *   • klik tengah / Ctrl-klik bekerja seperti tautan sungguhan;
 *   • Next.js bisa mem-prefetch halaman berikutnya;
 *   • dan kendalinya tetap berfungsi sebelum JavaScript apa pun dijalankan.
 *
 * AntD `Pagination` sendiri adalah tombol ber-`onClick`; memakainya apa adanya
 * akan menukar keempat sifat itu dengan `router.push`. Karena itu ia dipakai
 * lewat `itemRender`, yang mengganti isi setiap butir dengan `<Link href>`
 * sungguhan. Yang diambil dari AntD adalah tata letak, elipsis, ukuran target
 * sentuh, dan label yang sudah mengikuti locale `ConfigProvider`; yang
 * dipertahankan adalah navigasi berbasis URL.
 *
 * ── Harga yang dibayar, dan kenapa dianggap pantas ─────────────────────────
 * Berkas ini kini komponen client — satu modul lagi di `KLIEN_TERSAHKAN`
 * (`tests/rsc-boundary.test.ts`). Yang menyeberang hanya KENDALInya: empat
 * angka (`currentPage`, `totalPages`, `basePath`, `searchParams`), bukan satu
 * pun baris data. Halaman pemanggilnya tetap server component dan tabelnya
 * tetap dirender di server lewat `StaticTable`. Itulah bentuk kenaikan yang
 * dimaksud penjaga batas RSC: batasnya berhenti di daun, bukan merambat naik.
 */

import { Pagination as AntPagination } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Link } from "@/components/ui/app-link";
import { useT } from "@/lib/i18n/client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}

function buildUrl(
  basePath: string,
  page: number,
  searchParams?: Record<string, string | undefined>
) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams,
}: PaginationProps) {
  const t = useT();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-border px-6 py-3">
      {/* "Halaman 2 dari 9" — pada daftar panjang, nomor halaman saja tidak
          menjawab "masih berapa lagi". Dipertahankan dari versi sebelum #189. */}
      <p className="text-sm text-muted-foreground">
        {t("table.page", { page: currentPage, pages: totalPages })}
      </p>
      <AntPagination
        aria-label={t("pagination.aria")}
        // `pageSize` 1 dengan `total` = jumlah HALAMAN: komponen ini hanya
        // menggambar kendalinya, sedangkan pemotongan datanya sudah dikerjakan
        // server. Menyuapkan jumlah baris sebenarnya akan membuat AntD
        // menghitung ulang batas halaman dengan asumsi ukuran halaman yang
        // tidak dipakai siapa pun.
        current={currentPage}
        pageSize={1}
        total={totalPages}
        showSizeChanger={false}
        /*
         * Setiap butir yang bisa DITUJU jadi tautan sungguhan; `element`
         * bawaan AntD dipertahankan untuk yang bukan tujuan:
         *
         *  • elipsis `jump-prev`/`jump-next` — petunjuk "ada halaman lain di
         *    antaranya", bukan tempat;
         *  • panah di ujung daftar — di halaman pertama tidak ada "sebelumnya"
         *    untuk ditautkan, dan tombol AntD yang nonaktif sudah menyatakan
         *    itu dengan benar (termasuk ke pembaca layar).
         *
         * Ikon panah digambar sendiri, bukan diambil dari `element`: isi
         * `element` adalah `<button>`, dan menyarangkan tombol di dalam tautan
         * menghasilkan HTML tak sah yang juga menelan kliknya. Ikonnya sama
         * dengan versi sebelum #189, jadi tampilannya tidak berubah.
         */
        itemRender={(page, type, element) => {
          if (type === "jump-prev" || type === "jump-next") return element;
          const href = buildUrl(basePath, page, searchParams);
          if (type === "prev") {
            return currentPage > 1 ? (
              <Link href={href} aria-label={t("common.previous")}>
                <LeftOutlined aria-hidden="true" style={{ fontSize: 16 }} />
              </Link>
            ) : (
              element
            );
          }
          if (type === "next") {
            return currentPage < totalPages ? (
              <Link href={href} aria-label={t("common.next")}>
                <RightOutlined aria-hidden="true" style={{ fontSize: 16 }} />
              </Link>
            ) : (
              element
            );
          }
          return <Link href={href}>{page}</Link>;
        }}
      />
    </div>
  );
}
