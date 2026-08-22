/**
 * Kotak cari dokumentasi (issue #453) — `<form>` biasa, nol JavaScript.
 *
 * ══ KENAPA BUKAN `Input` MILIK `components/ui` ═════════════════════════════
 * `Input` adalah komponen AntD, dan komponen AntD adalah komponen KLIEN. Satu
 * kotak cari akan menjadi modul klien PERTAMA di permukaan yang hari ini nol
 * JavaScript — hidrasi yang dibayar setiap pembaca demi sebuah kotak yang
 * sebenarnya tidak menyimpan keadaan apa pun. Isian di bawah karena itu
 * `<input>` telanjang yang digayakan token yang SAMA (tinggi kendali, radius,
 * tepi, warna), pola yang sudah dipakai formulir kontak pendaratan.
 *
 * ══ `method="get"`, DAN ITU KEPUTUSAN, BUKAN BAWAAN ════════════════════════
 * Hasilnya menjadi ALAMAT (`/docs/cari?q=…`): bisa ditautkan, dikirim ke rekan,
 * dibuka lagi dari riwayat, dan dibaca mesin pencari. Sebuah kotak cari
 * ber-JavaScript yang menampilkan hasil "di tempat" kehilangan keempatnya.
 *
 * ⚠ `type="search"` bukan `type="text"`: papan ketik ponsel menampilkan tombol
 * "Cari" alih-alih "Enter", dan peramban menawarkan riwayat pencarian isian
 * itu. `name="q"` singkat dengan sengaja — ia terbaca di bilah alamat.
 */

import { SearchOutlined } from "@ant-design/icons";

import type { TranslateFn } from "@/lib/i18n/client";

const FORM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  /* Menyusut lebih dulu ketika baris konteks di sebelahnya panjang. */
  minWidth: 0,
};

const ISIAN: React.CSSProperties = {
  /* Tinggi & radius kendali app, tanpa satu byte JavaScript. */
  minHeight: 32,
  width: "100%",
  maxWidth: 280,
  borderRadius: "var(--ant-border-radius)",
  border: "1px solid var(--ant-color-border)",
  background: "var(--ant-color-bg-container)",
  color: "var(--ant-color-text)",
  paddingInline: "var(--ant-padding-xs)",
  fontSize: "var(--ant-font-size-sm)",
  fontFamily: "inherit",
};

const TOMBOL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 32,
  minHeight: 32,
  borderRadius: "var(--ant-border-radius)",
  border: "1px solid var(--ant-color-border)",
  background: "var(--ant-color-bg-container)",
  color: "var(--ant-color-text-secondary)",
  cursor: "pointer",
  fontFamily: "inherit",
};

/**
 * @param nilai kueri yang sedang berlaku — diisikan kembali ke kotaknya supaya
 *   pembaca bisa MENYUNTING pencariannya, bukan mengetik ulang dari nol.
 */
export function DocsSearchForm({ t, nilai }: { t: TranslateFn; nilai?: string }) {
  return (
    <form action="/docs/cari" method="get" role="search" style={FORM} data-docs-search="">
      {/* Label tersembunyi VISUAL, bukan dihapus: sebuah isian tanpa nama yang
          terbaca pembaca layar adalah isian yang tidak bisa dipakai sama sekali
          oleh sebagian orang. `placeholder` bukan pengganti label. */}
      <label htmlFor="docs-cari" data-docs-sr="">
        {t("docs.searchLabel")}
      </label>
      <input
        id="docs-cari"
        name="q"
        type="search"
        defaultValue={nilai}
        placeholder={t("docs.searchPlaceholder")}
        maxLength={120}
        autoComplete="off"
        style={ISIAN}
      />
      <button type="submit" style={TOMBOL} aria-label={t("docs.searchSubmit")}>
        <SearchOutlined aria-hidden="true" style={{ fontSize: 14 }} />
      </button>
    </form>
  );
}
