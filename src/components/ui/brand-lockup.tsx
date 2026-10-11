/**
 * LOCKUP MEREK — lambang + nama produk, satu susunan.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * Perombakan merek sebelumnya menutup "satu produk, tiga LAMBANG". Yang tidak
 * ikut tertutup, dan baru terukur sesudahnya: **satu lambang, enam LOCKUP**.
 * Setiap chrome menyusun pasangan lambang+nama sendiri, dan hasilnya berbeda
 * di tiga dimensi sekaligus:
 *
 *   | Permukaan        | ukuran nama        | bobot              | celah |
 *   |------------------|--------------------|--------------------|-------|
 *   | bilah pendaratan | `fontSizeLG` (16)  | `fontWeightStrong` | 8     |
 *   | sidebar aplikasi | `fontSizeLG` (16)  | `fontWeightStrong` | 8     |
 *   | `PlatformShell`  | `fontSizeLG` (16)  | `fontWeightStrong` | 8     |
 *   | layar masuk      | `fontSizeLG` (16)  | `fontWeightStrong` | 8     |
 *   | wizard penyiapan | **diwarisi (14)**  | `fontWeightStrong` | **12**|
 *   | chrome `/docs`   | **diwarisi (14)**  | **`600` harfiah**  | 8     |
 *
 * Dua baris terakhir bukan keputusan — tidak ada yang memutuskan nama produk
 * tampil 14px di wizard penyiapan dan 16px di bilah pendaratan. Keduanya hanya
 * tidak pernah dilihat berdampingan: orang yang menyelesaikan penyiapan lalu
 * membuka `/docs` melihat dua nama produk berukuran berbeda, dan yang terbaca
 * bukan "dua ukuran" melainkan "ada yang sedikit salah di sini".
 *
 * Lockup adalah bagian dari lambang, bukan tata letak di sekelilingnya. Begitu
 * ia tinggal di satu tempat, mengubah jarak atau bobotnya menjadi SATU
 * keputusan yang terlihat di diff — bukan enam yang harus ditemukan dulu.
 *
 * ══ YANG TETAP MILIK PEMANGGIL ═════════════════════════════════════════════
 * Pembungkusnya. `Link` (dan ke mana ia menuju), apakah ia boleh menyusut,
 * apakah namanya disembunyikan di layar sempit — semuanya keputusan chrome
 * masing-masing, dan menariknya ke sini akan membuat komponen ini tahu tentang
 * enam tata letak yang tidak ada urusannya dengan merek.
 *
 * ══ KOMPONEN BERSAMA (tanpa `"use client"`) ════════════════════════════════
 * Empat pemanggilnya client (`sidebar`, `platform-shell`, `auth-shell`,
 * `setup-shell`), dua server (`landing-nav`, `docs-public-chrome`). Berkas ini
 * karena itu tidak memakai hook maupun `theme.useToken()`: warnanya
 * `var(--ant-…)`, sah di keduanya sejak #227, dan `tests/rsc-boundary.test.ts`
 * tidak bergerak karenanya.
 */

import { BrandMark } from "@/components/ui/brand-mark";
import { APP_NAME } from "@/lib/constants";
import { NEUTRAL_TEXT_DARK } from "@/lib/theme/antd-tokens";

const TRUNCATE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export interface BrandLockupProps {
  /**
   * Ukuran lambangnya. `sm` (32px) untuk bilah; `md` (40px) untuk panel yang
   * memikul baris kedua.
   */
  size?: "sm" | "md";
  /**
   * `onDark` untuk bidang GELAP PERMANEN — sidebar, panel merek layar masuk,
   * kepala wizard penyiapan. Ketiganya tidak ikut berganti tema, jadi warnanya
   * tidak boleh diambil dari anak tangga yang berbalik (aturan MASTER.md
   * §Permukaan gelap permanen).
   */
  tone?: "default" | "onDark";
  /** Baris kedua di bawah nama — mis. "Penyiapan awal". */
  subtitle?: React.ReactNode;
  /** Ditempel SESUDAH nama pada baris yang sama — mis. "· Dokumentasi". */
  suffix?: React.ReactNode;
  /**
   * Atribut tambahan untuk span nama.
   *
   * Ada karena satu pemanggil memang membutuhkannya dan bukan karena
   * kelenturan: bilah pendaratan menyembunyikan NAMANYA (bukan lambangnya) di
   * bawah 576px lewat `[data-landing-brand-name]`, dan aturan itu hidup di
   * blok gaya `landing-scale.ts`. Tanpa jalan ini, pemanggil itu terpaksa
   * menyusun lockup-nya sendiri — yaitu persis keadaan yang berkas ini tutup.
   */
  nameProps?: React.ComponentProps<"span"> & Record<`data-${string}`, string>;
}

export function BrandLockup({
  size = "sm",
  tone = "default",
  subtitle,
  suffix,
  nameProps,
}: BrandLockupProps) {
  const gelap = tone === "onDark";
  const warnaUtama = gelap ? "var(--ant-color-text-light-solid)" : "var(--ant-color-text)";
  const warnaKedua = gelap
    ? NEUTRAL_TEXT_DARK.colorTextTertiary
    : "var(--ant-color-text-secondary)";

  const { style: gayaNama, ...sisaNama } = nameProps ?? {};

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        /* 8px, angka yang sudah dipakai lima dari enam pemanggil. Yang keenam
           memakai 12 dan itu bukan keputusan — lihat tabel di kepala berkas. */
        gap: "var(--ant-margin-xs)",
        minWidth: 0,
        color: warnaUtama,
      }}
    >
      <BrandMark size={size} />
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            ...TRUNCATE,
            display: "block",
            fontSize: "var(--ant-font-size-lg)",
            fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
            ...gayaNama,
          }}
          {...sisaNama}
        >
          {APP_NAME}
          {suffix}
        </span>
        {subtitle !== undefined && (
          <span
            style={{
              ...TRUNCATE,
              display: "block",
              fontSize: "var(--ant-font-size-sm)",
              color: warnaKedua,
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
