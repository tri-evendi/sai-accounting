"use client";

/**
 * "Pelajari ini" (issue #21) — tautan kontekstual dari layar yang rumit
 * langsung ke entri Kamus Istilah yang menjelaskannya. Judul dan tujuannya
 * diambil dari kamus tunggal `src/lib/labels.ts` — definisi tidak pernah
 * ditulis ulang di halaman.
 *
 * **Client component, dan HARUS tetap begitu.** Dulu ini server component
 * (tanpa "use client") demi "tidak menambah JavaScript", tapi komponen ini
 * juga dipakai DI DALAM dua form client — `inventory/update/stock-form.tsx`
 * dan `finance/new/transaction-form.tsx`. Begitu label butuh terjemahan,
 * versi server-nya menarik `lib/i18n/server.ts` (`server-only` +
 * `next/headers`) ikut masuk ke bundel browser lewat kedua form itu, dan
 * `next build` GAGAL — kegagalan yang tak terlihat oleh `tsc` karena ini
 * batasan bundler, bukan tipe. Karena itu terjemahan diambil lewat `useT()`.
 *
 * ── Kenapa ia TETAP `<Link>`, bukan `Typography.Link` AntD (issue #190) ────
 * Ini satu-satunya primitif fase B4 yang tidak merender komponen AntD, dan
 * alasannya sama dengan alasan komponen ini wajib client: ia dipakai DI DALAM
 * formulir. `Typography.Link` (juga `Button href` — lihat catatan `asChild` di
 * `button.tsx`) adalah `<a href>` biasa, yang berarti pemuatan halaman PENUH.
 * Ditekan dari tengah formulir stok atau transaksi keuangan yang setengah
 * terisi, pemuatan penuh membuang seluruh isian yang belum disimpan — untuk
 * membuka sebuah definisi. Tautan ini justru paling sering ditekan saat orang
 * ragu di tengah mengisi.
 *
 * Yang dipindahkan ke AntD adalah WARNANYA: `--ant-color-link`, variabel yang
 * ditulis `ConfigProvider` dan yang di aplikasi ini menunjuk `colorBrandText`
 * (#186) — anak tangga biru yang sudah diukur lolos 4,5:1 di ketiga latar,
 * bukan `colorPrimary` bawaan yang hanya 4,10:1 sebagai teks.
 */

import { Link } from "@/components/ui/app-link";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTerm, glossaryHref } from "@/lib/labels";
import { useT } from "@/lib/i18n/client";

interface LearnMoreProps {
  /** Kunci entri kamus, mis. "piutang". */
  term: string;
  /** Teks tautan; standarnya "Pelajari ini: <label>". */
  label?: string;
  className?: string;
}

export function LearnMore({ term, label, className }: LearnMoreProps) {
  // Hook dipanggil SEBELUM early-return: aturan hooks React melarang
  // pemanggilan bersyarat.
  const t = useT();

  const entry = getTerm(term);
  if (!entry) return null;

  return (
    <Link
      href={glossaryHref(entry.key)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md text-sm font-medium",
        "cursor-pointer transition-colors duration-150 hover:underline",
        // Cincin fokus tetap kelas: ini `<a>` telanjang, bukan komponen AntD,
        // jadi `genFocusStyle()` AntD tidak menyentuhnya.
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className
      )}
      style={{ color: "var(--ant-color-link)" }}
    >
      <BookOpen className="h-4 w-4" aria-hidden="true" />
      {label ?? t("learnMore.label", { term: entry.label })}
    </Link>
  );
}
