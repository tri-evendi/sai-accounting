/**
 * ANATOMI KONSOL OPERATOR — bingkai, permukaan, dan kalimat-mati, satu tempat.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * Kulit konsol (`operator-shell.tsx`) sudah berbentuk panel admin sejak ia
 * lahir, dan kepalanya menyebut penyakit yang disembuhkannya: empat salinan
 * konstanta `H1` di empat halaman. Penyakit itu tidak hilang — ia TURUN SATU
 * TINGKAT. Diukur sebelum berkas ini ditulis, sembilan halaman konsol memuat:
 *
 *   • **enam salinan `NOTICE`** ("penagihan tidak terjangkau") dalam EMPAT
 *     bentuk berbeda: padding 16px di tiga berkas dan 12px di tiga lainnya,
 *     radius `--ant-border-radius-lg` di tiga dan angka harfiah `8` di tiga,
 *     satu tanpa tepi sama sekali, satu tanpa `lineHeight`. Satu kalimat yang
 *     sama, digambar empat cara, di enam halaman yang dibuka orang yang sama
 *     dalam satu sesi;
 *   • **lima salinan `MUTED`** dalam dua bentuk (satu membawa `margin`+
 *     `fontSize: 14`, satu hanya warna);
 *   • **empat salinan gaya judul seksi** (`SECTION_HEADING`, `H2`, `H3`, dan
 *     dua `<h2 style={{…}}>` sebaris);
 *   • **jarak antar-bagian yang tidak satu angka**: 32px di dua halaman, 24px
 *     di lima, ditulis sebagai piksel telanjang — bukan token.
 *
 * Tak satu pun dari itu galat, dan justru itu masalahnya: tidak ada yang gagal,
 * jadi tidak ada yang memperbaikinya, dan yang terlihat di layar adalah
 * permukaan yang terbaca "belum selesai" tanpa ada satu baris pun yang bisa
 * ditunjuk sebagai salah.
 *
 * ══ DUA BINGKAI, DAN KAPAN MEMAKAI YANG MANA ═══════════════════════════════
 * Pembedaannya satu kalimat, supaya ia tidak menjadi selera:
 *
 *   • **`ConsolePanel` — isinya duduk di atas PERMUKAAN.** Tabel, formulir,
 *     daftar fakta, prosa. Ia `Card`: bertepi, berbayang (§266), dan karena itu
 *     memberi isinya batas yang bisa dilihat mata tanpa membaca.
 *   • **`ConsoleSection` — isinya SUDAH punya permukaan sendiri.** Kisi
 *     `StatCard`, yang masing-masing sudah kartu. Kartu di dalam kartu
 *     menghasilkan dua tepi berjarak 24px yang tidak memisahkan apa pun.
 *
 * Aturan itu mengikat: kalau isi sebuah bagian adalah `StatCard`, bingkainya
 * `ConsoleSection`; selain itu `ConsolePanel`.
 *
 * ══ SERVER COMPONENT, DAN KENAPA ITU PENTING DI SINI ═══════════════════════
 * Tanpa `"use client"`. Halaman konsol menjalankan kueri ke dua basis data lalu
 * merender tabelnya sebagai HTML; bingkai tidak punya alasan untuk ikut
 * menyeberang, dan `tests/rsc-boundary.test.ts` mengunci jumlah modul klien.
 * Warnanya karena itu `var(--ant-…)` — sah di server component sejak #227 —
 * bukan `theme.useToken()`.
 *
 * `Card` sendiri BERTANDA `"use client"` (ia `Card` AntD). Komponen boleh
 * menyeberangi batas itu; yang tidak boleh adalah objek gaya biasa — alasan
 * lengkapnya di kepala `components/ui/stat-tile.ts`. Karena itu konstanta di
 * bawah ditulis `var(--ant-…)`, bukan nilai token yang dibaca.
 *
 * ══ KENAPA BUKAN `DashboardSection` ════════════════════════════════════════
 * Ia memang hampir sama bentuknya, dan `StatCard` justru DIPAKAI apa adanya di
 * konsol ini dengan alasan yang tertulis di `(operator)/operator/page.tsx`.
 * Bedanya satu: `DashboardSection` membawa tautan "lihat semua" yang labelnya
 * `t("dashboard.seeAll")` dan menggambar `app-link` — komponen yang seluruh
 * sebab keberadaannya adalah menyelaraskan jalur BERTENANT. Di host `ops.` ia
 * meneruskan `href` apa adanya (jadi tidak rusak), tetapi memakainya berarti
 * konsol menyeret satu komponen pelanggan ke dalam folder yang sengaja dijaga
 * bisa diekstrak menjadi aplikasi kedua — untuk sebuah tautan yang halaman
 * konsol tidak pernah pakai. Yang diambil dari sana adalah ANGKA-nya (ukuran
 * judul, jarak kepala, anak tangga warna), bukan berkasnya.
 */

import type { CSSProperties } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ══ GAYA BERSAMA ═══════════════════════════════════════════════════════════
 * Diekspor supaya halaman berhenti mendefinisikannya ulang. Yang TIDAK ada di
 * sini: gaya yang hanya dipakai satu halaman (kolom tabel, lencana status) —
 * modul bersama yang memuat kasus tunggal adalah modul yang berhenti dibaca.
 */

/** Teks sekunder — satu bentuk, menggantikan lima salinan dalam dua bentuk. */
export const CONSOLE_MUTED: CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

/** Angka sebaris: lebar digit tetap supaya kolom angka berbaris (MASTER.md). */
export const CONSOLE_TABULAR: CSSProperties = { fontVariantNumeric: "tabular-nums" };

/**
 * Kolom halaman konsol — SATU jarak antar-bagian untuk sembilan halaman.
 *
 * `--ant-margin-lg` (24px), bukan 32: 24 adalah "jarak antar-bagian" di tabel
 * jarak MASTER.md, dan ia yang sudah dipakai lima dari sembilan halaman. Dua
 * halaman yang memakai 32 adalah yang bagiannya paling banyak — justru di sana
 * jarak yang lebih besar membuat bagian keempat jatuh di bawah lipatan.
 */
export const CONSOLE_PAGE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-lg)",
};

/**
 * Kisi ubin — `auto-fit` + `minmax`, bukan jumlah kolom tetap.
 *
 * Jumlah ubin berubah menurut data, jadi kolom tetap meninggalkan sel kosong
 * pada sebagian pemasangan. 220px (bukan 200): ubin pendapatan memuat nominal
 * rupiah penuh, dan pada 200px "Rp 1.199.000" membungkus menjadi dua baris
 * sementara ubin di sebelahnya tidak — yang terbaca sebagai baris yang patah.
 */
export const CONSOLE_TILES: CSSProperties = {
  display: "grid",
  gap: "var(--ant-margin)",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const SECTION: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-sm)",
};

const HEAD_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "var(--ant-margin-sm)",
};

const HEADING: CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const HEAD_DESCRIPTION: CSSProperties = {
  ...CONSOLE_MUTED,
  marginTop: "var(--ant-margin-xxs)",
};

/**
 * Kalimat "tak terjangkau" — SATU bentuk, menggantikan enam salinan.
 *
 * Ia bukan `Alert` AntD dan itu disengaja: `Alert` bernada peringatan, lengkap
 * dengan ikon dan warna semantik, sedangkan yang dikatakan kotak ini bukan
 * "ada yang salah pada Anda" melainkan "bagian ini tidak bisa dibaca sekarang".
 * Bidang platform memang BOLEH mati tanpa menjatuhkan halaman (aturan "dua
 * bidang data, satu yang boleh mati" — `pages/operator.md`), dan menjawabnya
 * dengan warna bahaya akan membuat keadaan yang sudah diantisipasi terbaca
 * seperti kerusakan.
 */
export function ConsoleNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        ...CONSOLE_MUTED,
        padding: "var(--ant-padding)",
        borderRadius: "var(--ant-border-radius-lg)",
        border: "1px solid var(--ant-color-border-secondary)",
        background: "var(--ant-color-fill-quaternary)",
        lineHeight: 1.625,
      }}
    >
      {children}
    </p>
  );
}

export interface ConsoleSectionProps {
  title: string;
  description?: string;
  /** Kendali rata-kanan pada baris judul. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Bingkai TANPA permukaan — untuk isi yang sudah berkartu sendiri.
 *
 * Judulnya `<h2>`: halaman konsol selalu punya `<h1>` dari `PageHeader`, jadi
 * urutan headingnya h1 → h2 tanpa tingkat yang dilompati (aturan aksesibilitas
 * yang sama yang membuat `CardTitle` bisa memilih tingkatnya, #355).
 */
export function ConsoleSection({
  title,
  description,
  actions,
  children,
}: ConsoleSectionProps) {
  return (
    <section style={SECTION}>
      <div style={HEAD_ROW}>
        <div style={{ minWidth: 0 }}>
          <h2 style={HEADING}>{title}</h2>
          {description && <p style={HEAD_DESCRIPTION}>{description}</p>}
        </div>
        {actions && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "var(--ant-margin-xs)",
            }}
          >
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export interface ConsolePanelProps extends Omit<ConsoleSectionProps, "title"> {
  /**
   * Judul kartu — BOLEH kosong, dan kekosongan itu punya arti sendiri.
   *
   * Panel tanpa judul dipakai ketika judulnya hanya akan mengulang `<h1>`
   * halaman ("Pelanggan" di atas "Daftar pelanggan"). Judul yang mengulang
   * bukan sekadar mubazir: pengguna pembaca layar yang menjelajah per-heading
   * mendapat dua simpul untuk satu wilayah, dan yang kedua tidak membawa
   * informasi baru. Yang tersisa dari kartunya tetap bekerja — tepi, bayangan,
   * dan batas wilayahnya.
   */
  title?: string;
  /**
   * Isi yang menggambar permukaannya sendiri sampai ke tepi kartu — tabel.
   *
   * `StaticTable` sudah membawa tepi, radius, dan nada kepalanya sendiri (#266),
   * jadi padding isi kartu di sekelilingnya menghasilkan bingkai di dalam
   * bingkai: dua garis berjarak 24px yang tidak memisahkan apa pun. Dengan
   * `flush`, tabel menempel pada tepi kartu dan yang terlihat tinggal SATU
   * bidang — kepala kartu di atas, tabelnya di bawah.
   */
  flush?: boolean;
  /** Baris kecil di bawah isi — catatan kaki, bukan kendali. */
  footnote?: React.ReactNode;
}

/**
 * Bingkai BERPERMUKAAN — kartu dengan kepala, untuk isi yang tanpa itu
 * mengambang di atas latar halaman.
 *
 * Inilah perubahan yang paling terlihat di seluruh konsol. Sebelum berkas ini,
 * sembilan halaman menggambar judul lalu LANGSUNG isinya di atas
 * `colorBgLayout`: tidak ada satu pun kartu di seluruh bidang operator,
 * sementara dasbor pelanggan dan `/platform` memakainya di mana-mana. Akibatnya
 * yang memisahkan satu wilayah dari wilayah berikutnya hanya JARAK — dan jarak
 * yang sama juga memisahkan baris di dalam satu wilayah, jadi mata tidak punya
 * apa pun untuk mengelompokkan. Itu, bukan warnanya, yang membuat permukaan ini
 * terbaca belum jadi.
 */
export function ConsolePanel({
  title,
  description,
  actions,
  children,
  flush,
  footnote,
}: ConsolePanelProps) {
  const berkepala = title !== undefined || description !== undefined || actions !== undefined;

  return (
    <Card>
      {berkepala && (
        <CardHeader
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "var(--ant-margin-sm)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {/* `level={2}` — kartu ini duduk LANGSUNG di bawah `<h1>` halaman
                (#355): bawaan `<h3>` akan melompati satu tingkat. */}
            {title !== undefined && <CardTitle level={2}>{title}</CardTitle>}
            {description && <p style={HEAD_DESCRIPTION}>{description}</p>}
          </div>
          {actions && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "var(--ant-margin-xs)",
              }}
            >
              {actions}
            </div>
          )}
        </CardHeader>
      )}
      <CardContent
        style={
          flush
            ? { padding: 0 }
            : {
                display: "flex",
                flexDirection: "column",
                gap: "var(--ant-margin)",
              }
        }
      >
        {children}
      </CardContent>
      {footnote && (
        <CardContent
          style={{
            paddingTop: 0,
            ...CONSOLE_MUTED,
            fontSize: "var(--ant-font-size-sm)",
          }}
        >
          {footnote}
        </CardContent>
      )}
    </Card>
  );
}
