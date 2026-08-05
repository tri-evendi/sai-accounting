"use client";

/**
 * Money / MoneyCell (issue #52, ditulis ulang di atas AntD pada issue #186) —
 * sel nominal yang menegakkan aturan uang MASTER.md di satu tempat: rata kanan,
 * `tabular-nums`, format id-ID, mata uang eksplisit, negatif berwarna DAN
 * bertanda minus, serta nilai tak diketahui yang ditulis "—", tak pernah 0.
 *
 * ── Kenapa jadi client component ───────────────────────────────────────────
 * Warnanya sekarang datang dari token AntD (`theme.useToken()`), dan itu hook.
 * Sebelumnya berkas ini server-safe. Yang HILANG hanya kemampuan merender
 * warnanya tanpa JavaScript; yang DIDAPAT adalah warna yang berganti bersama
 * tema tanpa muat ulang, dan tanpa satu pun hex tertulis di komponen. Halaman
 * server tetap boleh memakainya seperti biasa — komponen client yang dirender
 * dari server component tidak menular ke induknya.
 *
 * ── Kenapa tidak ada kelas Tailwind di sini ────────────────────────────────
 * Kelas seperti `text-success-strong` hidup di lapisan token yang BERBEDA dari
 * `ConfigProvider`. Dua lapisan warna untuk satu angka berarti ada hari di mana
 * keduanya tidak sepakat — dan yang kalah selalu yang tidak terlihat di kode.
 * Semua warna di sini berasal dari token AntD; `className` pemanggil tetap
 * diteruskan (untuk ukuran/berat huruf), tapi komponen ini tidak menulis satu
 * pun kelas sendiri.
 *
 * Contoh:
 *   <TableCell className="p-0"><MoneyCell value={1234567} currency="IDR" /></TableCell>
 *   // -> "Rp 1.234.567", rata kanan, tabular-nums
 *   <MoneyCell value={-50000} />
 *   // -> "-Rp 50.000" merah; tanda minus = penanda non-warna
 *   <MoneyCell value={null} />
 *   // -> "—" abu; BUKAN "Rp 0"
 */

import { theme } from "antd";

import { formatAmount, formatMoney, isNegative, type CurrencyCode } from "@/lib/money-format";
import { moneyPalette } from "@/lib/theme/antd-tokens";

/**
 * Nilai yang belum diketahui ditulis dengan em dash, bukan nol (MASTER.md).
 * Nol menyatakan "tidak ada nilai"; itu pernyataan yang berbeda dari "nilainya
 * belum diketahui", dan menjumlahkannya sebagai nol menyusutkan total tanpa
 * satu pun tanda di layar. Aturan ini menutup bug nyata di Piutang/Utang,
 * Nilai Persediaan, dan rekap mitra — jadi ia dijaga tes, bukan kebiasaan.
 */
const UNKNOWN = "—";

/**
 * Arah akuntansi sebuah angka, kalau tandanya sendiri tidak menyatakannya.
 *
 * `auto` (bawaan) mewarnai menurut tanda: negatif merah, positif hanya bila
 * `signed`. `positive`/`negative` untuk kolom yang arahnya ditentukan JUDUL
 * kolomnya, bukan tandanya — "Masuk"/"Keluar" pada Riwayat Stok, "Debit"/
 * "Kredit" pada buku besar. Di sana penanda non-warnanya adalah judul kolom
 * itu sendiri, jadi aturan "warna tak pernah penanda tunggal" tetap utuh.
 */
type MoneyTone = "auto" | "positive" | "negative" | "pending" | "neutral";

interface MoneyProps extends Omit<React.ComponentProps<"span">, "children"> {
  /**
   * `null`/`undefined` = nilainya belum diketahui -> "—". JANGAN memaksanya
   * jadi 0 di pemanggil; itulah bug yang tipe ini ada untuk mencegahnya.
   */
  value: number | null | undefined;
  currency?: CurrencyCode;
  /**
   * Sembunyikan simbol mata uang — untuk kolom yang mata uangnya sudah
   * dinyatakan di judul kolom (mis. "Nilai (IDR)"), agar tidak diulang tiap
   * baris.
   */
  hideCurrency?: boolean;
  /**
   * Warnai positif hijau juga. Default hanya negatif yang diwarnai, karena
   * di tabel keuangan mayoritas angka positif — mewarnai semuanya justru
   * membuat yang penting tidak menonjol.
   */
  signed?: boolean;
  tone?: MoneyTone;
}

/** Angka nominal inline (tanpa perataan) — untuk teks mengalir & kartu KPI. */
function Money({
  value,
  currency = "IDR",
  hideCurrency,
  signed,
  tone = "auto",
  style,
  ...props
}: MoneyProps) {
  const { token } = theme.useToken();
  const money = moneyPalette(token);

  const unknown = value === null || value === undefined || Number.isNaN(value);
  const negative = !unknown && isNegative(value);
  const resolvedTone: MoneyTone =
    tone !== "auto"
      ? tone
      : negative
        ? "negative"
        : signed && !unknown && value > 0
          ? "positive"
          : "neutral";

  const color = unknown
    ? // Sekunder, bukan tersier: `colorTextTertiary` gagal 4,5:1 di kedua tema
      // (issue #207). Sebuah "—" yang tak terbaca adalah nilai yang hilang dua
      // kali.
      token.colorTextSecondary
    : resolvedTone === "positive"
      ? money.colorMoneyPositive
      : resolvedTone === "negative"
        ? money.colorMoneyNegative
        : resolvedTone === "pending"
          ? money.colorMoneyPending
          : // Netral: warna diserahkan ke pewarisan, supaya angka biasa memakai
            // warna teks permukaannya (dan pemanggil masih bisa menimpanya).
            undefined;

  const text = unknown
    ? UNKNOWN
    : hideCurrency
      ? formatAmount(value, currency)
      : formatMoney(value, currency);

  return (
    <span
      data-slot="money"
      data-unknown={unknown || undefined}
      style={{ fontVariantNumeric: "tabular-nums", color, ...style }}
      {...props}
    >
      {text}
    </span>
  );
}

/**
 * Isi sel tabel untuk kolom nominal: `Money` + perataan kanan + padding sel.
 * Dipakai sebagai anak `<TableCell className="p-0">` atau langsung sebagai
 * renderer kolom di `DataTable`.
 *
 * Padding diambil dari token AntD (`paddingSM`/`paddingLG` = 12px/24px), jadi
 * ia ikut kalau kerapatan tabel diubah lewat tema. Pemanggil yang butuh baris
 * lebih rapat menimpanya lewat `style` (mis. `style={{ paddingBlock: 8 }}`) —
 * bukan lewat `className`, karena gaya sebaris selalu menang atas kelas.
 */
function MoneyCell({ className, style, ...props }: MoneyProps) {
  const { token } = theme.useToken();
  return (
    <div
      className={className}
      style={{
        paddingBlock: token.paddingSM,
        paddingInline: token.paddingLG,
        textAlign: "right",
        ...style,
      }}
    >
      <Money {...props} />
    </div>
  );
}

export { Money, MoneyCell, UNKNOWN };
export type { MoneyProps, MoneyTone };
