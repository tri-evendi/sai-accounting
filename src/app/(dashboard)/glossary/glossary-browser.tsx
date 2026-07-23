"use client";

/**
 * Penjelajah Kamus Istilah (issue #21) — pencarian + saringan kategori.
 *
 * Semua isinya berasal dari `src/lib/labels.ts`, kamus yang sama dengan
 * `<TermTooltip>` (issue #1): definisi ditulis satu kali, dipakai di mana-mana.
 * Komponen ini hanya menyaring dan menggambar.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  TERM_CATEGORIES,
  TERM_CATEGORY_LABELS,
  searchTerms,
  termAnchorId,
  termsByCategory,
  type TermCategory,
} from "@/lib/labels";

export function GlossaryBrowser() {
  const [query, setQuery] = useState("");
  const [kategori, setKategori] = useState<TermCategory | "semua">("semua");

  const groups = useMemo(
    () => termsByCategory(searchTerms(query, kategori === "semua" ? undefined : kategori)),
    [query, kategori]
  );
  const total = groups.reduce((sum, group) => sum + group.terms.length, 0);

  const filters: { value: TermCategory | "semua"; label: string }[] = [
    { value: "semua", label: "Semua" },
    ...TERM_CATEGORIES.map((c) => ({ value: c, label: TERM_CATEGORY_LABELS[c] })),
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative max-w-md">
          {/* Ikon diikat ke sisi BAWAH agar tetap sejajar dengan kotak isian,
              karena <Input> menaruh labelnya di atas kotak. */}
          <Search
            className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="cari-istilah"
            label="Cari istilah"
            placeholder="mis. piutang, faktur, penyusutan"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Saring per kategori">
          {filters.map((f) => {
            const active = kategori === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setKategori(f.value)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-muted-foreground hover:bg-muted"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {total} istilah ditampilkan.
        </p>
      </div>

      {total === 0 ? (
        <Card>
          <EmptyState
            title="Istilah tidak ditemukan"
            description="Coba kata lain, misalnya “tagihan”, “stok”, atau “pajak”. Semua istilah bisa dilihat dengan mengosongkan pencarian."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.kategori}>
              <h2 className="mb-3 text-lg font-semibold text-foreground">{group.label}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {group.terms.map((entry) => (
                  // Anchor "Pelajari ini" mendarat di sini; `scroll-mt` menjaga
                  // kartunya tidak tertutup navbar yang menempel di atas.
                  <div key={entry.key} id={termAnchorId(entry.key)} className="scroll-mt-24">
                    <Card className="h-full">
                      <div className="p-5">
                        <h3 className="text-base font-semibold text-foreground">{entry.label}</h3>
                        <p className="mt-0.5 text-sm font-medium text-primary">{entry.term}</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {entry.definisi}
                        </p>
                        {entry.contoh && (
                          <p className="mt-3 rounded-md bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">Contoh: </span>
                            {entry.contoh}
                          </p>
                        )}
                        {entry.href && (
                          <Link
                            href={entry.href}
                            className="mt-3 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary transition-colors duration-150 hover:text-primary hover:underline"
                          >
                            Buka di aplikasi
                            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
