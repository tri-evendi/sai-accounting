/**
 * Panel "Langkah Pertama" — sambutan untuk perusahaan yang belum bertransaksi.
 *
 * Server component seperti `QuickActions`: daftarnya sudah disaring izin
 * efektif di server (`visibleFirstSteps`), jadi langkah yang tidak boleh
 * dikerjakan seseorang tidak ikut dikirim ke browsernya — bukan disembunyikan
 * CSS. Tak sebaris pun ikut ke bundel client.
 *
 * Status "sudah/belum" TIDAK pernah disampaikan lewat warna saja (MASTER.md
 * §Anti-Patterns): baris yang selesai membawa ikon centang DAN kata
 * "Selesai"; yang belum membawa nomor urut dan ajakan bertindak.
 */

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  ListChecks,
  PackagePlus,
  Receipt,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { FirstStep, FirstStepProgress } from "@/lib/first-steps";

const ICONS: Record<string, LucideIcon> = {
  Users,
  Truck,
  PackagePlus,
  Receipt,
  ArrowDownLeft,
};

export async function FirstStepsPanel({
  steps,
  progress,
}: {
  steps: FirstStep[];
  progress: FirstStepProgress;
}) {
  if (steps.length === 0) return null;

  const t = await getT();
  const doneCount = steps.filter((step) => progress[step.key]).length;

  return (
    <section aria-labelledby="langkah-pertama-judul">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="langkah-pertama-judul" className="text-lg font-semibold text-foreground">
          {t("firstSteps.title")}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t("firstSteps.subtitle")}</p>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Kemajuan sebagai ANGKA, bukan bilah warna: "2 dari 5" bisa dibaca
            pembaca layar dan tetap benar tanpa warna. */}
        <p className="border-b border-border bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
          {t("firstSteps.progress", { done: doneCount, total: steps.length })}
        </p>

        <ol>
          {steps.map((step, index) => {
            const Icon = ICONS[step.icon] ?? Receipt;
            const done = progress[step.key] === true;

            return (
              <li key={step.key} className="border-b border-border last:border-b-0">
                <Link
                  href={step.href}
                  className={cn(
                    "group flex cursor-pointer items-center gap-4 px-4 py-3",
                    "transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      done ? "bg-success-soft text-success-strong" : "bg-primary/10 text-primary"
                    )}
                    aria-hidden="true"
                  >
                    {done ? <Check className="h-5 w-5" strokeWidth={3} /> : <Icon className="h-5 w-5" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {/* Nomor urut hanya untuk yang BELUM: pada baris selesai
                          ia sudah digantikan centang, dan dua penanda untuk satu
                          keadaan hanya menambah bising. */}
                      {!done && (
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {index + 1}.
                        </span>
                      )}
                      <span className="text-base font-semibold text-foreground">
                        {t(step.labelKey)}
                      </span>
                      {done && (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-strong">
                          {t("firstSteps.done")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {t(step.descriptionKey)}
                    </span>
                  </span>

                  <span
                    className={cn(
                      "hidden shrink-0 items-center gap-1 text-sm font-medium sm:flex",
                      done ? "text-muted-foreground" : "text-primary"
                    )}
                  >
                    {done ? t("firstSteps.again") : t("firstSteps.start")}
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
