/**
 * StatCard — kartu angka ringkas beranda & /platform.
 *
 * ── `tone`, dan kenapa ia BUKAN kelas Tailwind (issue #229) ────────────────
 * Beranda kehilangan warna kartu angkanya di #199/#227: satu-satunya cara
 * mewarnainya adalah `valueClassName`, sebuah kelas Tailwind, dan beranda tidak
 * boleh lagi menulis satu pun. Menyeberangkan beranda menjadi client demi tiga
 * warna berarti seluruh kueri buku besarnya ikut ke peramban — harga yang jauh
 * lebih besar dari yang dibeli.
 *
 * ── `valueClassName` DICABUT di issue #200 ────────────────────────────────
 * Jalur lama itu hidup semata-mata karena `/platform` belum dikonversi; sejak
 * fase C8 tidak ada satu pun pemanggil yang tersisa, jadi ia dihapus.
 *
 * Yang perlu diketahui sebelum menyimpulkan `tone` cukup: kedua pemanggil
 * terakhirnya memakai `valueClassName` untuk DUA hal, bukan satu — warna DAN
 * ukuran (`text-lg`). Nilai kartu status adalah sebuah KATA ("Ditangguhkan")
 * dan nilai kartu tunggakan adalah untaian nominal per mata uang
 * ("Rp 12.345.678 · US$ 50"); pada 30px keduanya melewati lebar kartunya
 * sendiri di 768px dan memecah baris ringkasan. Karena itu pencabutan
 * `valueClassName` datang bersama `size`, bukan hanya `tone` — mengganti satu
 * kelas Tailwind yang bisa berisi apa saja dengan dua prop bertipe yang
 * masing-masing menyatakan MAKSUDNYA.
 *
 * `tone` mengembalikannya tanpa memindahkan satu berkas pun melewati batas RSC:
 * **berkas ini tetap server component**, dan warnanya datang dari VARIABEL CSS
 * milik token AntD, bukan dari `theme.useToken()` (sebuah hook, yang akan
 * memaksanya jadi client).
 *
 * Variabel itu teratasi di mana pun sejak #227 (PR #238): `AntdProvider` memberi
 * `cssVar` sebuah kunci tetap dan root layout memasangnya di `<html>`, jadi blok
 * `.sai-tokens{--ant-…}` ada di HTML pertama dan diwarisi seluruh dokumen —
 * bukan hanya pohon di bawah sebuah komponen AntD. Syarat lama "harus dirender
 * di dalam `Card`" karena itu SUDAH DICABUT; jangan menyalinnya kembali dari
 * berkas yang belum diperbarui.
 *
 * ── Tanpa satu kelas Tailwind pun (issue #240, fase C9) ────────────────────
 * Yang HILANG bersama kelasnya, dan itu perlu diketahui sebelum seseorang
 * mengira ini kelalaian: `hover:shadow-md`. Kartu ber-`href` dulu terangkat saat
 * disentuh kursor. Keadaan `:hover` tidak bisa ditulis sebagai gaya sebaris, dan
 * jalan yang benar adalah prop `hoverable` milik `Card` AntD — yang tidak
 * diteruskan primitif `components/ui/card.tsx` (tanda tangannya `div`). Itu
 * lingkup #203; dicatat sebagai calon issue dengan pemanggil nyata, bukan
 * ditambal dengan `<style>` sisipan per kartu. Petunjuk "ini bisa diklik" tetap
 * ada: elemennya `<a href>`, jadi kursornya tetap berubah.
 *
 * Anak tangganya adalah token uang #186 (`colorMoneyPositive`/`Pending`/
 * `Negative`), bukan `colorSuccess`/`colorWarning`/`colorError` bawaan: angka
 * kartu ini adalah TEKS, dan bawaan AntD gagal 4,5:1 sebagai teks di tema
 * terang (2,27:1 / 1,90:1 / 3,27:1 — lihat `lib/theme/antd-tokens.ts`).
 *
 * Warnanya TIDAK PERNAH penanda tunggal: judul kartunya sendiri menyebut
 * keadaannya ("Stok Menipis", "Menunggu") dan tiap kartu menaut ke daftar yang
 * sudah tersaring — aturan "warna bukan satu-satunya sinyal" MASTER.md.
 */

import { Link } from "@/components/ui/app-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TILE_CONTENT, TILE_HEADER, TILE_LABEL } from "@/components/ui/stat-tile";

/**
 * Arah angka kartu. `neutral` (bawaan) sengaja tanpa warna: di beranda
 * mayoritas kartu netral, dan mewarnai semuanya membuat yang penting berhenti
 * menonjol — aturan yang sama dengan `Money.signed`.
 */
type StatTone = "neutral" | "success" | "warning" | "danger";

const TONE_COLOR: Record<StatTone, string | undefined> = {
  neutral: undefined,
  success: "var(--ant-color-money-positive)",
  warning: "var(--ant-color-money-pending)",
  danger: "var(--ant-color-money-negative)",
};

/**
 * Ukuran nilai kartu.
 *
 * `number` (bawaan) = `fontSizeHeading2`, 30px — sama persis dengan `text-3xl`
 * sebelum migrasi, ukuran untuk ANGKA, isi mayoritas kartu ini.
 * `phrase` = `fontSizeLG`, 16px, untuk nilai yang berupa KATA atau untaian
 * nominal antar-mata uang; lihat catatan pencabutan `valueClassName` di kepala
 * berkas. Ia dulu 18px (`text-lg`), yang bukan anak tangga token mana pun —
 * turun ke 16 dan bukan naik ke 20 (`fontSizeXL`) karena prop ini ADA justru
 * untuk mencegah untaian "Rp 12.345.678 · US$ 50" melewati lebar kartunya di
 * 768px. Dua piksel lebih kecil aman; empat piksel lebih besar belum diukur.
 */
type StatSize = "number" | "phrase";

const SIZE_FONT: Record<StatSize, string> = {
  number: "var(--ant-font-size-heading-2)",
  phrase: "var(--ant-font-size-lg)",
};

/* Kepala, badan, dan judul ubin datang dari `components/ui/stat-tile.ts` —
 * modul yang sama yang dipakai `QuotaMeter`, supaya keduanya bisa berdiri
 * berdampingan di satu kisi tanpa terbaca sebagai dua keluarga kartu. Yang
 * berubah bersamanya, dan itu perbaikan bukan efek samping: `CardHeader` tidak
 * lagi menggambar garis bawah 4px di bawah judulnya (alasan lengkap di kepala
 * `stat-tile.ts`). */

/** `mt-1 text-sm text-muted-foreground` — baris konteks di bawah angkanya. */
const HINT: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

interface StatCardProps {
  title: string;
  value: number | string;
  href?: string;
  tone?: StatTone;
  size?: StatSize;
  /**
   * Baris kedua di bawah angkanya — konteks yang membuat angka itu bisa
   * ditindaklanjuti ("jatuh tempo 31 Agu 2026", "2 tagihan"). Sengaja teks,
   * bukan `ReactNode`: kartu ringkasan bukan tempat menaruh kendali.
   */
  hint?: string;
}

export function StatCard({
  title,
  value,
  href,
  tone = "neutral",
  size = "number",
  hint,
}: StatCardProps) {
  const content = (
    <Card style={href ? { height: "100%" } : undefined}>
      <CardHeader style={TILE_HEADER}>
        <CardTitle level={2} style={TILE_LABEL}>{title}</CardTitle>
      </CardHeader>
      <CardContent style={TILE_CONTENT}>
        {/* Warna DASARnya `colorText`; `tone` menimpanya hanya ketika ia memang
            menyebut arah. */}
        <p
          style={{
            margin: 0,
            fontSize: SIZE_FONT[size],
            fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
            fontVariantNumeric: "tabular-nums",
            color: TONE_COLOR[tone] ?? "var(--ant-color-text)",
          }}
        >
          {value}
        </p>
        {hint && <p style={HINT}>{hint}</p>}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} style={{ display: "block", height: "100%" }}>
        {content}
      </Link>
    );
  }

  return content;
}
