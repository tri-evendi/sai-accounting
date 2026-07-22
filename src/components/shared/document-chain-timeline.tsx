import { FileText, Truck, Receipt, Wallet, Check, Minus, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ChainStatus, ContractChainStage } from "@/lib/document-chain";

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

const statusBadge: Record<ChainStatus, { variant: "success" | "warning" | "default"; label: string }> =
  {
    selesai: { variant: "success", label: "Selesai" },
    sebagian: { variant: "warning", label: "Sebagian" },
    belum: { variant: "default", label: "Belum" },
  };

const statusMark = {
  selesai: Check,
  sebagian: Clock,
  belum: Minus,
} as const;

/** Ring colour of the stage bullet. Paired with the mark icon, never alone. */
const statusRing: Record<ChainStatus, string> = {
  selesai: "border-green-600 bg-green-50 text-green-700",
  sebagian: "border-amber-600 bg-amber-50 text-amber-700",
  belum: "border-gray-300 bg-gray-50 text-gray-400",
};

function stageAmount(stage: ContractChainStage, currency: string): string {
  if (stage.unit === "IDR") {
    return `${formatCurrency(stage.done, currency)} / ${formatCurrency(stage.target, currency)}`;
  }
  return `${formatNumber(stage.done)} / ${formatNumber(stage.target)} kg`;
}

export function DocumentChainTimeline({
  stages,
  currency = "IDR",
}: {
  stages: ContractChainStage[];
  /** Currency of the money-denominated stage (payments are summed in IDR base). */
  currency?: string;
}) {
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
                className="absolute left-1/2 top-5 hidden h-px w-full bg-gray-200 lg:block"
              />
            )}
            <div className="relative flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
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
                  <p className="truncate text-sm font-medium text-gray-900">
                    <span className="text-gray-400">{i + 1}. </span>
                    {stage.label}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stage.count} dokumen
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={badge.variant}>
                  <Mark className="mr-1 h-3 w-3" aria-hidden />
                  {badge.label}
                </Badge>
                <span className="truncate text-right text-xs tabular-nums text-gray-700">
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
