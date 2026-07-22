/**
 * MoneyCell (issue #52) — sel nominal yang menegakkan aturan uang MASTER.md
 * di satu tempat: rata kanan, `tabular-nums`, format id-ID, mata uang
 * eksplisit, negatif merah dengan tanda minus.
 *
 * Server-safe (tanpa hook), jadi bisa dipakai di 36 tabel yang berupa server
 * component maupun di `DataTable` sisi client lewat `moneyColumn`.
 *
 * Contoh:
 *   <TableCell className="p-0"><MoneyCell value={1234567} currency="IDR" /></TableCell>
 *   // -> "Rp 1.234.567", rata kanan, tabular-nums
 *   <MoneyCell value={-50000} />
 *   // -> "-Rp 50.000" berwarna destructive; tanda minus = penanda non-warna
 */

import { formatAmount, formatMoney, isNegative, type CurrencyCode } from "@/lib/money-format";
import { cn } from "@/lib/utils";

interface MoneyProps extends Omit<React.ComponentProps<"span">, "children"> {
  value: number;
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
}

/** Angka nominal inline (tanpa perataan) — untuk teks mengalir & kartu KPI. */
function Money({ value, currency = "IDR", hideCurrency, signed, className, ...props }: MoneyProps) {
  const negative = isNegative(value);
  const text = hideCurrency ? formatAmount(value, currency) : formatMoney(value, currency);
  return (
    <span
      data-slot="money"
      className={cn(
        "tabular-nums",
        negative && "text-destructive",
        signed && !negative && value > 0 && "text-success",
        className
      )}
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
 */
function MoneyCell({ className, ...props }: MoneyProps) {
  return (
    <div className={cn("px-6 py-3 text-right", className)}>
      <Money {...props} />
    </div>
  );
}

export { Money, MoneyCell };
export type { MoneyProps };
