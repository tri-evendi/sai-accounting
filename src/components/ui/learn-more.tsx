/**
 * "Pelajari ini" (issue #21) — tautan kontekstual dari layar yang rumit
 * langsung ke entri Kamus Istilah yang menjelaskannya.
 *
 * Server component biasa (tanpa "use client"): hanya sebuah `Link` ke
 * `/glossary#istilah-<kunci>`, jadi bisa ditempel di halaman mana pun tanpa
 * menambah JavaScript. Judul dan tujuan tautannya diambil dari kamus tunggal
 * `src/lib/labels.ts` — definisi tidak pernah ditulis ulang di halaman.
 */

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTerm, glossaryHref } from "@/lib/labels";

interface LearnMoreProps {
  /** Kunci entri kamus, mis. "piutang". */
  term: string;
  /** Teks tautan; standarnya "Pelajari ini: <label>". */
  label?: string;
  className?: string;
}

export function LearnMore({ term, label, className }: LearnMoreProps) {
  const entry = getTerm(term);
  if (!entry) return null;

  return (
    <Link
      href={glossaryHref(entry.key)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-blue-700",
        "cursor-pointer transition-colors duration-150 hover:text-blue-900 hover:underline",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1",
        className
      )}
    >
      <BookOpen className="h-4 w-4" aria-hidden="true" />
      {label ?? `Pelajari ini: ${entry.label}`}
    </Link>
  );
}
