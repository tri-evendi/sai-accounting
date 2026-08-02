/**
 * Panel "Aksi Cepat" (issue #2) — enam pekerjaan tersering, satu klik dari Beranda.
 *
 * Server component (async): daftar aksinya sudah disaring per peran di server
 * (`quickActionsForRole`), jadi tombol yang tidak boleh dipakai peran tersebut
 * tidak ikut dikirim ke browser — bukan disembunyikan dengan CSS.
 *
 * Arah uang ditandai ikon + TEKS ("Uang masuk" / "Uang keluar"), tidak pernah
 * warna saja, sesuai aturan semantik uang di MASTER.md.
 */

import { Link } from "@/components/ui/app-link";
import {
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  FileText,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import type { QuickAction, QuickActionTone } from "@/lib/quick-actions";

const ICONS: Record<string, LucideIcon> = {
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  FileText,
};

const TONE_STYLES: Record<QuickActionTone, { icon: string; note: string; labelKey: DictionaryKey }> = {
  in: {
    icon: "bg-success-soft text-success-strong group-hover:bg-success-soft",
    note: "text-success-strong",
    labelKey: "quickActions.tone.in",
  },
  out: {
    icon: "bg-destructive-soft text-destructive-strong group-hover:bg-destructive-soft",
    note: "text-destructive-strong",
    labelKey: "quickActions.tone.out",
  },
  stock: {
    icon: "bg-warning-soft text-warning-strong group-hover:bg-warning-soft",
    note: "text-warning-strong",
    labelKey: "quickActions.tone.stock",
  },
  neutral: {
    icon: "bg-primary/10 text-primary group-hover:bg-primary/10",
    note: "text-primary",
    labelKey: "quickActions.tone.neutral",
  },
};

export async function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  // Server component: kamus diambil langsung di server, jadi panel ini tidak
  // menambah satu byte pun ke bundel client.
  const t = await getT();

  return (
    <section data-tour="aksi-cepat" aria-labelledby="aksi-cepat-judul">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="aksi-cepat-judul" className="text-lg font-semibold text-foreground">
          {t("quickActions.title")}
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t("quickActions.subtitle")}</p>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = ICONS[action.icon] ?? FileText;
          const tone = TONE_STYLES[action.tone];
          return (
            <Link
              key={action.key}
              href={action.href}
              className={cn(
                "group flex min-h-[6.5rem] cursor-pointer items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm",
                "transition-shadow duration-200 hover:shadow-md",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                  tone.icon
                )}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">
                  {t(action.labelKey)}
                </span>
                <span className={cn("mt-0.5 block text-xs font-medium", tone.note)}>
                  {t(tone.labelKey)}
                </span>
                <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                  {t(action.descriptionKey)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
