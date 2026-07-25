/**
 * Panel "Alur Kerja" (panduan urutan) di Beranda.
 *
 * Menjawab "mulai dari mana?": tiap alur digambar sebagai langkah bernomor yang
 * bisa diklik, dihubungkan panah, sehingga pengguna awam melihat URUTAN kerja
 * (Kontrak → Catat Penjualan → Terima Uang → Pantau Piutang), bukan sekadar
 * daftar menu. Server component — daftar alur & langkah sudah disaring izin di
 * server (`visibleWorkflows`), jadi langkah yang tak boleh dipakai tak dikirim.
 *
 * Warna nada (masuk/keluar/netral) hanya aksen; makna dibawa NOMOR + LABEL,
 * jadi tak melanggar aturan "jangan warna saja" MASTER.md.
 */
import Link from "next/link";
import {
  Route,
  ChevronRight,
  FileText,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  ShoppingCart,
  Wallet,
  Scale,
  Lock,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workflow, WorkflowTone } from "@/lib/workflows";

const ICONS: Record<string, LucideIcon> = {
  FileText,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  ShoppingCart,
  Wallet,
  Scale,
  Lock,
  BarChart3,
};

const TONE_BADGE: Record<WorkflowTone, string> = {
  in: "bg-success-soft text-success-strong",
  out: "bg-destructive-soft text-destructive-strong",
  neutral: "bg-primary/10 text-primary",
};

export function WorkflowGuide({ workflows }: { workflows: Workflow[] }) {
  if (workflows.length === 0) return null;

  return (
    <section data-tour="alur-kerja" aria-labelledby="alur-judul">
      <div className="mb-3 flex items-center gap-2">
        <Route className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="alur-judul" className="text-lg font-semibold text-foreground">
          Alur Kerja
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Belum tahu mulai dari mana? Ikuti urutan langkah berikut — tiap langkah membuka halamannya.
      </p>

      <div className="space-y-4">
        {workflows.map((wf) => (
          <div key={wf.id} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <h3 className="text-base font-semibold text-foreground">{wf.label}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{wf.description}</p>

            <ol className="mt-4 flex flex-col gap-2 md:flex-row md:items-stretch">
              {wf.steps.map((step, i) => {
                const Icon = ICONS[step.icon] ?? FileText;
                return (
                  <li key={step.href} className="flex items-stretch md:flex-1">
                    <Link
                      href={step.href}
                      className={cn(
                        "group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3",
                        "transition-shadow duration-200 hover:shadow-md",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                          TONE_BADGE[wf.tone]
                        )}
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="text-sm font-semibold text-foreground">{step.label}</span>
                          {step.optional && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              opsional
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                          {step.description}
                        </span>
                      </span>
                    </Link>

                    {/* Penghubung urutan: panah ke kanan di desktop, ke bawah di
                        mobile (chevron diputar). Disembunyikan sesudah langkah terakhir. */}
                    {i < wf.steps.length - 1 && (
                      <span
                        className="flex shrink-0 items-center justify-center self-center px-1 text-muted-foreground"
                        aria-hidden="true"
                      >
                        <ChevronRight className="h-4 w-4 rotate-90 md:rotate-0" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
