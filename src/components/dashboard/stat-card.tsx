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
 * Variabel itu teratasi di sini karena angkanya dirender DI DALAM `Card`, dan
 * `Card` adalah komponen AntD: `ConfigProvider` v6 memasang setiap token pada
 * elemen ber-kelas `css-var-root` yang digambar komponen AntD sendiri — bukan
 * pada `:root`. Aturan yang sama dengan `components/shared/aging.tsx` (#194) dan
 * dengan beranda itu sendiri. Kalau kartu ini kelak dipakai di luar `Card`,
 * warnanya akan jatuh diam-diam ke warisan — itulah alasan `tone` hidup DI SINI
 * dan bukan sebagai gaya yang ditulis pemanggil.
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
import { cn } from "@/lib/utils";

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
 * `number` (bawaan) = 30px, ukuran untuk ANGKA — itu isi mayoritas kartu ini.
 * `phrase` = 18px, untuk nilai yang berupa KATA atau untaian nominal antar-mata
 * uang; lihat catatan pencabutan `valueClassName` di kepala berkas.
 */
type StatSize = "number" | "phrase";

const SIZE_CLASS: Record<StatSize, string> = {
  number: "text-3xl",
  phrase: "text-lg",
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
    <Card className={cn(href && "hover:shadow-md transition-shadow cursor-pointer h-full")}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* `text-foreground` tetap sebagai warna DASAR; gaya sebaris menimpanya
            hanya ketika `tone` memang menyebut arah. */}
        <p
          className={cn(SIZE_CLASS[size], "font-bold text-foreground tabular-nums")}
          style={TONE_COLOR[tone] === undefined ? undefined : { color: TONE_COLOR[tone] }}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} className="block h-full">{content}</Link>;
  }

  return content;
}
