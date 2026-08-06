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

interface StatCardProps {
  title: string;
  value: number | string;
  href?: string;
  tone?: StatTone;
  /**
   * Jalur lama berbasis kelas Tailwind, masih dipakai `/platform` yang belum
   * dikonversi. Pemanggil baru memakai `tone`.
   */
  valueClassName?: string;
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
  valueClassName,
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
          className={cn("text-3xl font-bold text-foreground tabular-nums", valueClassName)}
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
