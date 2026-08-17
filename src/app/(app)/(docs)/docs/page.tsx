/**
 * `/docs` — DAFTAR ISI dokumentasi, PUBLIK (issue #300).
 *
 * ══ Kenapa halaman ini tidak memanggil satu penjaga pun ════════════════════
 * Itu keputusan 1, dan ia dinyatakan di tiga tempat supaya tidak bisa lolos
 * karena terlupa:
 *   • `src/proxy.ts` — `isDocsPath()` melepaskan subpohon ini dari pemeriksaan
 *     sesi;
 *   • `tests/authz-coverage.test.ts` — grup rute `(docs)` terdaftar sebagai
 *     grup PUBLIK, dengan describe-nya sendiri yang menuntut halaman di
 *     dalamnya TIDAK memanggil penjaga apa pun (penjaga izin di sini akan
 *     memantulkan justru pembaca yang halamannya dibuat untuknya);
 *   • `tests/docs.test.ts` — halaman & komponennya tidak boleh mengimpor
 *     `auth()`, Prisma, atau chrome app internal.
 *
 * Alasannya bukan kenyamanan: sebagian pertanyaan yang paling sering ditanyakan
 * lahir persis ketika orang TIDAK BISA masuk. Dokumentasi yang menuntut sesi
 * menjawab semua pertanyaan kecuali itu.
 *
 * ══ Dua cabang, bukan satu daftar ═════════════════════════════════════════
 * Pelanggan yang MEMBELI dan pengguna yang MEMAKAI tidak saling menggantikan;
 * menyatukan keduanya adalah cara termudah membuat daftar isi yang harus
 * dilewati setengahnya oleh setiap pembaca.
 *
 * ══ KENAPA DAFTAR, BUKAN SEPULUH KARTU ════════════════════════════════════
 * Sampai penataan ini setiap entri adalah kartu: tepi, bayangan, isian, dan
 * judul biru. Sepuluh kartu seragam yang berjajar ke bawah menghasilkan tekstur
 * yang RATA — tidak ada yang lebih berat daripada yang lain, jadi tidak ada
 * yang bisa dipindai; dan chrome kartu itu sendiri menghabiskan tinggi layar
 * yang seharusnya dipakai memperlihatkan lebih banyak judul sekaligus.
 *
 * Kartu adalah bentuk untuk PILIHAN SETARA yang jumlahnya sedikit; daftar isi
 * dengan sepuluh entri bukan itu. Karena itu bentuknya dibalik:
 *
 *   • **dua cabang** tetap mendapat perlakuan "peta" — sebuah bilah lompat di
 *     puncak halaman, dengan jumlah halaman masing-masing, supaya pembaca tahu
 *     ada dua pembaca yang berbeda dan bisa langsung turun ke bagiannya;
 *   • **sepuluh entri** menjadi daftar tipografis: judul tebal berwarna teks,
 *     satu kalimat sekunder di bawahnya, garis rambut sebagai pemisah, dan
 *     tanda panah di tepi kanan.
 *
 * Judulnya SENGAJA bukan biru tautan. Warna kehilangan artinya begitu semua
 * baris memakainya: sepuluh judul biru adalah sepuluh penekanan, yaitu nol.
 * Afordans tautannya tetap ada dan tidak bergantung pada warna saja — panah di
 * tepi, garis bawah + warna tautan saat disorot/difokus (aturannya di
 * `docs-shell.tsx`). Kalau seseorang kelak mengembalikannya menjadi biru, ini
 * yang ditukar.
 *
 * Yang TIDAK dikerjakan, dan sebabnya, supaya tidak dicoba ulang:
 *   • **kolom baca tidak dilebarkan.** MASTER.md §Dokumentasi menetapkan 768px,
 *     dan melebarkannya justru merusak yang sedang diperbaiki — kalimat ringkas
 *     yang membentang melewati ±75 karakter berhenti bisa dipindai sekali lihat.
 *     Kanvas yang terasa kosong di layar lebar adalah harga kolom baca, bukan
 *     cacat yang perlu diisi.
 *   • **entri tidak dinomori.** Urutan `DOC_INDEX` memang urutan baca, tetapi
 *     ia urutan baca PER CABANG; nomor 1–8 di satu bagian dan 1–2 di bagian lain
 *     terbaca sebagai satu rangkaian yang terputus.
 */

import type { Metadata } from "next";
import { RightOutlined } from "@ant-design/icons";

import { DocsShell } from "@/components/docs/docs-shell";
import { Link } from "@/components/ui/app-link";
import {
  DOC_BRANCHES,
  docBranchAnchor,
  docsInBranch,
  docsPath,
  type DocBranch,
} from "@/lib/docs";
import { getRequestI18n } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Dirender per permintaan, bukan statis: judul & nama cabang mengikuti cookie
 * bahasa, dan halaman statis akan memanggangnya menjadi satu bahasa untuk
 * semua orang.
 */
export const dynamic = "force-dynamic";

const CABANG: Record<DocBranch, { judul: DictionaryKey; ringkas: DictionaryKey }> = {
  pelanggan: { judul: "docs.branchCustomer", ringkas: "docs.branchCustomerDescription" },
  pengguna: { judul: "docs.branchUser", ringkas: "docs.branchUserDescription" },
};

/** Id label bilah lompat — dipakai `aria-labelledby`, jadi ia harus tetap. */
const ID_LABEL_LOMPAT = "docs-jump-label";

const BILAH_LOMPAT: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
};

const LOMPAT_LABEL: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
  marginInlineEnd: "var(--ant-margin-xxs)",
};

/**
 * Sasaran sentuh, bukan hiasan: tautan teks 14px punya bidang klik setinggi
 * barisnya saja. Isian di sini yang membuatnya bisa ditekan di ponsel — dan
 * ia isian, bukan tepi, supaya bilah ini tidak terbaca sebagai deretan KENDALI
 * (tombol/pilihan) yang ukurannya diatur di tempat lain.
 */
const LOMPAT_TAUTAN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  padding: "var(--ant-padding-xs) var(--ant-padding-sm)",
  borderRadius: "var(--ant-border-radius)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
  /*
   * Garis bawah saat disorot ditulis di CSS (`docs-shell.tsx`), BUKAN di sini —
   * `globals.css` sudah membuat tautan tidak bergaris (`text-decoration:
   * inherit`), dan sebuah `text-decoration:"none"` sebaris justru akan
   * mengalahkan aturan `:hover` itu. Sorotnya sengaja dua tanda sekaligus
   * (isian + garis bawah): isian saja adalah isyarat warna-saja.
   */
};

const LOMPAT_HITUNG: React.CSSProperties = {
  fontWeight: 400,
  color: "var(--ant-color-text-tertiary)",
};

const SEKSI: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-sm)",
  /*
   * Bilah kepala halaman tidak menempel, jadi ini bukan soal tertutup —
   * melainkan supaya judul bagian yang baru dilompati tidak berdiri persis di
   * garis atas layar.
   */
  scrollMarginTop: "var(--ant-margin-lg)",
};

/**
 * Garis rambut di bawah kepala bagian. Inilah yang menggantikan jarak besar:
 * MASTER.md §Dokumentasi mengunci irama antar-bagian di 24px (irama app, bukan
 * irama pemasaran 64–96px), jadi pemisahan bagian harus datang dari GARIS,
 * bukan dari ruang yang tidak boleh ditambah.
 */
const SEKSI_KEPALA: React.CSSProperties = {
  paddingBottom: "var(--ant-padding-xs)",
  borderBottom: "1px solid var(--ant-color-border-secondary)",
};

const SEKSI_JUDUL: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-heading-4)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const SEKSI_RINGKAS: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

const DAFTAR: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const BARIS: React.CSSProperties = {
  borderBottom: "1px solid var(--ant-color-border-secondary)",
};

const BARIS_TAUTAN: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: "var(--ant-margin-sm)",
  padding: "var(--ant-padding-sm) 0",
  color: "inherit",
  textDecoration: "none",
};

/**
 * `<h3>` — satu anak tangga di bawah judul bagian (`<h2>`), yang sendirinya di
 * bawah `<h1>` halaman. Sebelumnya kesepuluh judul ini `<span>`, jadi pembaca
 * layar yang melompat antar-judul melihat daftar isi ini sebagai DUA baris.
 */
const BARIS_JUDUL: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: 600,
  lineHeight: 1.4,
  color: "var(--ant-color-text)",
};

const BARIS_RINGKAS: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

const BARIS_PANAH: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-quaternary)",
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestI18n();
  return { title: t("docs.title"), description: t("docs.description") };
}

export default async function DocsIndexPage() {
  const { t } = await getRequestI18n();

  const cabangTerisi = DOC_BRANCHES.map((cabang) => ({
    cabang,
    halaman: docsInBranch(cabang),
  })).filter(({ halaman }) => halaman.length > 0);

  return (
    <DocsShell judul={t("docs.title")} ringkas={t("docs.description")}>
      {/*
       * Bilah lompat. Dua sasaran memang sedikit, tetapi yang dikerjakannya
       * bukan hanya melompat: ia menyatakan DI PUNCAK bahwa dokumentasi ini
       * ditulis untuk dua pembaca yang berbeda, dan berapa besar bagian
       * masing-masing — keputusan yang sebelumnya baru ketahuan setelah
       * menggulung melewati bagian yang salah.
       */}
      <nav style={BILAH_LOMPAT} aria-labelledby={ID_LABEL_LOMPAT}>
        <span id={ID_LABEL_LOMPAT} style={LOMPAT_LABEL}>
          {t("docs.jumpTo")}
        </span>
        {cabangTerisi.map(({ cabang, halaman }) => (
          <a
            key={cabang}
            data-docs-jump
            href={`#${docBranchAnchor(cabang)}`}
            style={LOMPAT_TAUTAN}
          >
            {t(CABANG[cabang].judul)}
            <span style={LOMPAT_HITUNG}>
              {t("docs.pageCount", { count: halaman.length })}
            </span>
          </a>
        ))}
      </nav>

      {cabangTerisi.map(({ cabang, halaman }) => (
        <section key={cabang} id={docBranchAnchor(cabang)} style={SEKSI}>
          <div style={SEKSI_KEPALA}>
            <h2 style={SEKSI_JUDUL}>{t(CABANG[cabang].judul)}</h2>
            <p style={SEKSI_RINGKAS}>{t(CABANG[cabang].ringkas)}</p>
          </div>
          <ul data-docs-list style={DAFTAR}>
            {halaman.map((page) => (
              <li key={page.slug} style={BARIS}>
                <Link data-docs-row href={docsPath(page.slug)} style={BARIS_TAUTAN}>
                  {/*
                   * `<div>`, bukan `<span>`: isinya `<h3>` dan `<p>` — konten
                   * alir, yang tidak sah di dalam elemen frasa. `<a>` sendiri
                   * boleh memuatnya (model kontennya transparan, dan induknya
                   * `<li>`).
                   */}
                  <div>
                    <h3 data-docs-row-title style={BARIS_JUDUL}>
                      {page.judul}
                    </h3>
                    <p style={BARIS_RINGKAS}>{page.ringkas}</p>
                  </div>
                  <RightOutlined data-docs-row-arrow style={BARIS_PANAH} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocsShell>
  );
}
