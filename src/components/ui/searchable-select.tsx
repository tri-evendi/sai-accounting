"use client";

/**
 * SearchableSelect (issue #22, dirombak #51, ditulis ulang di atas AntD `Select
 * showSearch` pada issue #188) — pemilih satu nilai dengan pencarian ketik.
 *
 * ── Yang keluar ───────────────────────────────────────────────────────────
 * Rakitan `Popover` + `Command` (cmdk) diganti satu komponen AntD. cmdk dipakai
 * dulu justru untuk hal yang sekarang sudah ada di dalam AntD: `role="combobox"`
 * dengan `aria-activedescendant`, navigasi panah/Enter/Escape, dan filter ketik.
 * Yang IKUT DIDAPAT dan tidak dimiliki versi lama: daftar tervirtualisasi (300
 * consignee tidak lagi berarti 300 simpul DOM) dan popup yang diportal ke
 * `<body>` dengan pembalikan otomatis saat ruang di bawah habis — perilaku yang
 * paling terasa di 375px.
 *
 * `Command`/`Popover` TIDAK ikut dihapus: `Command` masih memikul palet perintah
 * ⌘K (`components/layout/command-palette.tsx`), dan `Popover` masih dipakai
 * `TermTooltip`. Keduanya sekarang punya satu pemakai, bukan tiga.
 *
 * ── Yang hilang, dan harus disebut ────────────────────────────────────────
 * `searchPlaceholder` kini TIDAK berpengaruh. Pada pola lama kotak pencarian
 * hidup di dalam popover sehingga punya placeholder sendiri; pada AntD, yang
 * diketik adalah pemicunya sendiri — placeholder-nya adalah `placeholder`.
 * Prop-nya tetap diterima supaya lima pemanggilnya tidak perlu disentuh di fase
 * B; hapus di fase C (#194–#198) bersama teks kamusnya.
 */

import { Select, type SelectProps } from "antd";

import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";

export interface SearchableOption {
  value: string;
  label: string;
  /** Baris kedua opsional (mis. negara / kontak) yang tampil di bawah label. */
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  /** @deprecated Tidak berpengaruh sejak #188 — lihat komentar kepala berkas. */
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show a clear (×) button when a value is selected. Default true. */
  clearable?: boolean;
  disabled?: boolean;
}

/**
 * Filter yang mencocokkan LABEL dan baris deskripsi — persis cakupan cmdk
 * sebelumnya (mengetik nama kota menemukan consignee-nya). `filterOption`
 * bawaan AntD hanya melihat satu field, jadi ia harus ditulis.
 */
function matchesQuery(query: string, option?: SearchableOption): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${option?.label ?? ""} ${option?.description ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

/**
 * Dua baris di dalam satu opsi. `label` polos tidak cukup: deskripsi harus
 * tampil lebih kecil dan teredam, dan keduanya harus terpotong dengan elipsis
 * supaya daftar tidak pernah lebih lebar dari pemicunya di 375px.
 */
const optionRender: SelectProps<string, SearchableOption>["optionRender"] = (option) => (
  <span style={{ display: "block", minWidth: 0 }}>
    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
      {option.data.label}
    </span>
    {option.data.description && (
      <span
        style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "0.75rem",
          opacity: 0.8,
        }}
      >
        {option.data.description}
      </span>
    )}
  </span>
);

export function SearchableSelect({
  options,
  value,
  onChange,
  id,
  label,
  placeholder,
  emptyText,
  clearable = true,
  disabled = false,
}: SearchableSelectProps) {
  const t = useT();

  return (
    <div style={{ display: "grid", gap: "var(--ant-margin-xxs)" }}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Select<string, SearchableOption>
        data-slot="searchable-select"
        id={id}
        style={{ width: "100%" }}
        options={options}
        // `null` adalah "belum dipilih" bagi pemanggil, tetapi bagi AntD ia
        // nilai yang sah — hanya `undefined` yang memunculkan placeholder.
        value={value ?? undefined}
        onChange={(next) => onChange(next ?? null)}
        placeholder={placeholder ?? t("searchableSelect.placeholder")}
        notFoundContent={emptyText ?? t("searchableSelect.empty")}
        allowClear={clearable}
        disabled={disabled}
        optionRender={optionRender}
        showSearch={{ filterOption: (input, option) => matchesQuery(input, option) }}
        // Daftar tidak pernah melebihi lebar pemicunya — tidak ada popup yang
        // menyembul keluar layar 375px.
        popupMatchSelectWidth
      />
    </div>
  );
}
