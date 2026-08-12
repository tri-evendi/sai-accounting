/**
 * ANATOMI KOTAK RINGKAS — satu bentuk untuk `StatCard` dan `QuotaMeter`.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * Baris ringkasan `/platform` menaruh KEDUA komponen itu berdampingan di satu
 * kisi — dua meteran kuota lalu sebuah kartu status. Sampai berkas ini ada,
 * keduanya menggambar kotaknya masing-masing, dan hasilnya di layar adalah tiga
 * ubin sebaris yang terbaca sebagai DUA keluarga:
 *
 *   |                   | `QuotaMeter` (dulu)     | `StatCard` (dulu)        |
 *   |-------------------|-------------------------|--------------------------|
 *   | permukaan         | `div` bertepi sendiri   | `Card` (+ bayangan #266) |
 *   | padding sisi      | 16px                    | 24px (`Card` = padLG)    |
 *   | garis di bawah    | tidak ada               | ADA — `CardHeader`       |
 *   | judul→nilai       | 4px                     | 20px (4 + padding isi)   |
 *   | ukuran judul      | diwarisi (16px)         | 14px                     |
 *
 * Yang paling terlihat adalah baris ketiga. `CardHeader` membawa
 * `borderBottom` karena ia memang kepala KARTU; pada sebuah ubin angka, judul
 * dan nilai adalah SATU pasangan, jadi garis itu memisahkan dua hal yang justru
 * harus dibaca bersama — dan pada `StatCard` ia mendarat 4px di bawah judulnya
 * (`paddingBottom: paddingXXS`, warisan `pb-1` shadcn yang dulu tidak punya
 * tepi bawah). Bukan keputusan; sisa migrasi.
 *
 * ══ KENAPA `.ts` TELANJANG, BUKAN DIEKSPOR DARI `card.tsx` ═════════════════
 * `StatCard` adalah SERVER component dan `card.tsx` bertanda `"use client"`.
 * Komponen boleh menyeberangi batas itu; **objek biasa tidak** — ia sampai di
 * sisi server sebagai referensi klien, bukan sebagai nilai. Karena itu ketiga
 * konstanta di bawah tinggal di modul tanpa direktif, dan warnanya ditulis
 * sebagai `var(--ant-…)` supaya SATU nilai yang sama dipakai oleh pemanggil
 * server (`StatCard`) maupun klien (`QuotaMeter`) — bukan dua salinan yang akan
 * menyimpang pada hari salah satunya disetel.
 */
import type { CSSProperties } from "react";

/**
 * Kepala ubin — TANPA garis bawah, dan itu inti berkas ini (lihat tabel di
 * kepala). Jaraknya ke nilai tinggal `paddingXXS` (4px): judul dan angka satu
 * pasangan, bukan dua bagian kartu.
 */
export const TILE_HEADER: CSSProperties = {
  paddingBottom: "var(--ant-padding-xxs)",
  borderBottom: "none",
};

/** Badan ubin — padding atasnya dinihilkan; jarak ke judul sudah dari kepala. */
export const TILE_CONTENT: CSSProperties = {
  paddingTop: 0,
};

/**
 * Judul ubin — 14px `colorTextSecondary`, ukuran yang sama dengan judul kartu
 * KPI beranda. Ia LABEL, bukan heading yang dibaca sebagai isi: yang harus
 * menang secara visual adalah nilainya.
 */
export const TILE_LABEL: CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
  color: "var(--ant-color-text-secondary)",
};
