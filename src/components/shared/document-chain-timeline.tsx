import { FileText, Truck, Receipt, Wallet, Check, Minus, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ChainStatus, ContractChainStage } from "@/lib/document-chain";
import { getT } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Timeline dokumen berantai (issue #15): Kontrak → Surat Jalan → Faktur →
 * Pembayaran, with each stage's progress.
 *
 * Server component — it only formats numbers the page already computed. Status is
 * never colour-only (MASTER.md §Anti-Patterns): every stage carries a text badge
 * AND an icon, so it reads the same to a colour-blind user and in print.
 */

const stageIcons = {
  contract: FileText,
  delivery: Truck,
  invoice: Receipt,
  payment: Wallet,
} as const;

const statusBadge: Record<
  ChainStatus,
  { variant: "success" | "warning" | "default"; labelKey: DictionaryKey }
> = {
  selesai: { variant: "success", labelKey: "chainStatus.selesai" },
  sebagian: { variant: "warning", labelKey: "chainStatus.sebagian" },
  belum: { variant: "default", labelKey: "chainStatus.belum" },
};

/**
 * Nama tahap diambil dari KUNCI tahap, bukan dari `stage.label`: labelnya
 * disusun `lib/document-chain.ts` yang menarik Prisma, jadi teksnya tidak bisa
 * ikut ke kamus di sana. Nilai literal di modul itu tetap ada sebagai bahasa
 * sumber, persis seperti `label` di `WORKFLOWS`.
 */
const stageLabelKeys: Record<ContractChainStage["key"], DictionaryKey> = {
  contract: "chainStage.contract",
  delivery: "chainStage.delivery",
  invoice: "chainStage.invoice",
  payment: "chainStage.payment",
};

const statusMark = {
  selesai: Check,
  sebagian: Clock,
  belum: Minus,
} as const;

/** Ring colour of the stage bullet. Paired with the mark icon, never alone. */
const statusRing: Record<ChainStatus, string> = {
  selesai: "border-success bg-success-soft text-success-strong",
  sebagian: "border-warning bg-warning-soft text-warning-strong",
  belum: "border-border bg-muted text-muted-foreground",
};

function stageAmount(stage: ContractChainStage, currency: string): string {
  if (stage.unit === "IDR") {
    return `${formatCurrency(stage.done, currency)} / ${formatCurrency(stage.target, currency)}`;
  }
  return `${formatNumber(stage.done)} / ${formatNumber(stage.target)} kg`;
}

export async function DocumentChainTimeline({
  stages,
  currency = "IDR",
}: {
  stages: ContractChainStage[];
  /** Currency of the money-denominated stage (payments are summed in IDR base). */
  currency?: string;
}) {
  const t = await getT();
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stages.map((stage, i) => {
        const Icon = stageIcons[stage.key];
        const Mark = statusMark[stage.status];
        const badge = statusBadge[stage.status];
        return (
          <li key={stage.key} className="relative">
            {/* Connector: only between stages, and only where they sit in a row. */}
            {i < stages.length - 1 && (
              <span
                aria-hidden
                className="absolute left-1/2 top-5 hidden h-px w-full bg-muted lg:block"
              />
            )}
            <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                    statusRing[stage.status]
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    <span className="text-muted-foreground">{i + 1}. </span>
                    {t(stageLabelKeys[stage.key])}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("aging.docCount", { count: stage.count })}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={badge.variant}>
                  <Mark className="mr-1 h-3 w-3" aria-hidden />
                  {t(badge.labelKey)}
                </Badge>
                <span className="truncate text-right text-xs tabular-nums text-foreground">
                  {stageAmount(stage, currency)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
