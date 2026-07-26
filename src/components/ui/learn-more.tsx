"use client";

/**
 * "Pelajari ini" (issue #21) — tautan kontekstual dari layar yang rumit
 * langsung ke entri Kamus Istilah yang menjelaskannya. Hanya sebuah `Link` ke
 * `/glossary#istilah-<kunci>`; judul dan tujuannya diambil dari kamus tunggal
 * `src/lib/labels.ts` — definisi tidak pernah ditulis ulang di halaman.
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
 * Ongkos bundelnya nihil: korpus `lib/labels.ts` sudah lebih dulu ada di sisi
 * client lewat `term-tooltip.tsx` yang dipakai di form-form yang sama.
 */

import Link from "next/link";
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
        "inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary",
        "cursor-pointer transition-colors duration-150 hover:text-primary hover:underline",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className
      )}
    >
      <BookOpen className="h-4 w-4" aria-hidden="true" />
      {label ?? t("learnMore.label", { term: entry.label })}
    </Link>
  );
}
