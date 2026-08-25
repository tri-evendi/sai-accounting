"use client";

/**
 * ItemNameInput (issue #503) — nama barang yang BOLEH diketik bebas, tetapi
 * menawarkan barang dari master dan menautkannya begitu salah satu dipilih.
 *
 * == KENAPA BUKAN SelectField / SearchableSelect ============================
 * Karena baris faktur tidak selalu barang persediaan. "Ongkos kirim" dan
 * "selisih timbang" adalah baris yang benar-benar ada di faktur nyata dan
 * TIDAK boleh punya baris di master barang. `document-chain.ts` menyatakannya
 * sendiri: "a faktur may legitimately add a line the contract has no promise
 * for (ongkos kirim, selisih timbang)".
 *
 * Pemilih yang WAJIB — pola yang dipakai kontrak di #491 — akan mematahkan
 * pemakaian itu. Jadi bentuknya dibalik: yang dirender tetap KOTAK TEKS, dan
 * daftar barang datang sebagai SARAN. Mengetik bebas bukan jalan pengecualian
 * yang harus dicari; ia jalan yang sama seperti sebelumnya.
 *
 * == TAUTANNYA MENGIKUTI, TIDAK MENDAHULUI =================================
 * Memilih saran mengisi `itemId` DAN `itemName` sekaligus. Mengetik sesuatu
 * yang BERBEDA sesudahnya MENCABUT `itemId` — sebab baris yang namanya sudah
 * bukan nama barang itu tidak boleh tetap mengaku menunjuknya. Tautan yang
 * bertahan diam-diam atas nama yang sudah berubah adalah cara paling halus
 * untuk mengurangi pagu kontrak atas barang yang tidak pernah difakturkan.
 *
 * Pencabutannya TIDAK bergantung pada urutan `onChange`/`onSelect` milik AntD:
 * yang dibandingkan adalah teksnya dengan nama yang sedang tertaut. Teks yang
 * sama persis mempertahankan tautan, apa pun yang memicunya; teks yang berbeda
 * mencabutnya. Bergantung pada urutan peristiwa berarti bergantung pada detail
 * yang bisa berubah di rilis AntD berikutnya.
 *
 * == LABEL SARAN: kode + nama ==============================================
 * Sejak #493 dua barang boleh bernama sama (LONG PEPPER 100006 & 100010), jadi
 * daftar yang hanya menampilkan nama akan memperlihatkan dua baris yang tampak
 * identik. Yang MASUK ke isian tetap namanya saja — itu yang tercetak di
 * faktur; kodenya hidup di `itemId`.
 */
import { AutoComplete } from "antd";

export interface ItemSuggestion {
  id: number;
  code: string;
  name: string;
  unit: string | null;
}

interface ItemOption {
  key: number;
  value: string;
  label: string;
  itemId: number;
}

export function ItemNameInput({
  id,
  value,
  itemId,
  suggestions,
  onChange,
  placeholder,
}: {
  id?: string;
  /** Nama sebagaimana tertulis di baris — inilah yang tercetak di faktur. */
  value: string;
  /** Barang yang sedang tertaut, atau `null` bila barisnya teks bebas. */
  itemId: number | null;
  suggestions: ItemSuggestion[];
  /** Dipanggil dengan pasangan yang KONSISTEN — nama dan tautannya sekaligus. */
  onChange: (next: { itemName: string; itemId: number | null }) => void;
  placeholder?: string;
}) {
  /*
   * `key` id, `value` nama: AntD memakai `value` sebagai teks yang masuk ke
   * isian, dan dua barang boleh bernama sama — `key` yang membedakan keduanya
   * di daftar, `itemId` yang dibawa pulang saat dipilih.
   */
  const options: ItemOption[] = suggestions.map((s) => ({
    key: s.id,
    value: s.name,
    label: `${s.code} — ${s.name}${s.unit ? ` (${s.unit})` : ""}`,
    itemId: s.id,
  }));

  /** Nama barang yang SEDANG tertaut — dasar keputusan cabut/pertahankan. */
  const linkedName = itemId == null ? null : value;

  return (
    <AutoComplete<string, ItemOption>
      id={id}
      style={{ width: "100%" }}
      value={value}
      options={options}
      placeholder={placeholder}
      /* Disaring atas LABEL, yang memuat kode maupun nama: pengguna gudang
         hafal kodenya, pengguna kantor hafal namanya, dan keduanya mengetik di
         kotak yang sama. */
      filterOption={(input, option) =>
        String(option?.label ?? "")
          .toLowerCase()
          .includes(input.trim().toLowerCase())
      }
      onSelect={(_value, option) => {
        onChange({ itemName: option.value, itemId: option.itemId });
      }}
      onChange={(next) => {
        const text = typeof next === "string" ? next : "";
        /* Teks yang sama persis dengan nama yang tertaut MEMPERTAHANKAN
           tautannya — inilah yang membuat pencabutan tidak bergantung pada
           urutan peristiwa AntD saat sebuah saran dipilih. */
        onChange({ itemName: text, itemId: text === linkedName ? itemId : null });
      }}
    />
  );
}
