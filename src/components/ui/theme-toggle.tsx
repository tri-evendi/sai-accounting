"use client";

/**
 * Pemilih tema — tiga pilihan berdampingan di atas Ant Design `Segmented`
 * (issue #191), bukan satu tombol yang berputar.
 *
 * Tombol berputar (terang → gelap → sistem → terang) hemat ruang dan menyimpan
 * dua kebiasaan buruk sekaligus: pilihannya tidak terlihat sebelum ditekan,
 * dan mencapai pilihan ketiga menuntut menekan dua kali sambil menghafal
 * urutannya. `Segmented` menunjukkan seluruh pilihan dan mana yang aktif.
 *
 * ── Apa yang TIDAK berubah, dan kenapa itu bagian terpenting ──────────────
 * Jalur datanya sama persis seperti sebelum migrasi: `changeTheme()` dari
 * `lib/theme/client.tsx` menulis cookie yang SAMA dan menyentuh
 * `documentElement` supaya layar berubah seketika. Komponen ini tidak menyentuh
 * cookie, tidak memanggil `matchMedia`, dan tidak meminta server merender ulang
 * — dua sumber kebenaran tema adalah persis bug yang membuat toggle terlihat
 * rusak. AntD ikut berpindah pada saat yang sama karena `AntdProvider`
 * berlangganan konteks `useTheme()` yang sama (lihat kepala berkas itu); tidak
 * ada muat ulang, dan tidak ada frame di mana halaman sudah gelap tapi
 * komponen AntD masih terang.
 *
 * ── Keadaan aktif tidak pernah disampaikan warna saja ────────────────────
 * `Segmented` memindahkan "ibu jari" (bidang terangkat) ke pilihan yang aktif,
 * dan `<input type="radio" checked>` di baliknya mengumumkan "terpilih".
 *
 * ── Nama yang terbaca pembaca layar ──────────────────────────────────────
 * `Segmented` menyusun nama tiap pilihan dari ISI labelnya. Pilihan berikon
 * saja karena itu tidak punya nama sama sekali — `title` hanya tooltip tetikus,
 * dan ia menempel pada div di dalam `<label>`, bukan pada labelnya. Karena itu
 * setiap pilihan membawa katanya sendiri secara visual-tersembunyi. Bukan
 * `aria-label`: itu diabaikan pada `<span>` tanpa peran.
 *
 * `name` diambil dari `useId()`, bukan konstanta: halaman pendaratan merender
 * DUA pemilih tema (bilah atas dan kaki halaman), dan dua kelompok radio
 * bernama sama akan saling mematikan tanda `checked`-nya di DOM.
 */

import { useId } from "react";
import { Segmented } from "antd";
import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import type { IconComponent } from "@/lib/icons";
import { useT } from "@/lib/i18n/client";
import { useTheme } from "@/lib/theme/client";
import { THEMES, type Theme } from "@/lib/theme/config";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

const ICONS: Record<Theme, IconComponent> = {
  light: SunOutlined,
  dark: MoonOutlined,
  system: DesktopOutlined,
};

const LABELS: Record<Theme, DictionaryKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};

/** Terbaca pembaca layar, tak memakan ruang di layar. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, changeTheme } = useTheme();
  const t = useT();
  const name = useId();

  return (
    <Segmented<Theme>
      className={className}
      /*
       * `Segmented` sudah merender `role="radiogroup"` sendiri — yang perlu
       * diganti hanya namanya: bawaannya string Inggris yang ditanam di dalam
       * rc-segmented ("segmented control"), yang akan diumumkan apa adanya di
       * layar berbahasa Indonesia maupun Mandarin.
       */
      aria-label={t("theme.label")}
      name={name}
      value={theme}
      onChange={changeTheme}
      options={THEMES.map((option) => {
        const Icon = ICONS[option];
        const label = t(LABELS[option]);
        return {
          value: option,
          icon: <Icon aria-hidden="true" style={{ fontSize: 16 }} />,
          label: <span style={VISUALLY_HIDDEN}>{label}</span>,
          title: label,
        };
      })}
    />
  );
}
