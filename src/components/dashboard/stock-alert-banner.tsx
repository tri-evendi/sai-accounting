import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

export type LowStockAlertItem = {
  name: string;
  currentStock: number;
  unit: string | null;
};

export async function StockAlertBanner({ items }: { items: LowStockAlertItem[] }) {
  if (items.length === 0) return null;

  const t = await getT();

  const preview = items.slice(0, 5);
  const remaining = items.length - preview.length;

  return (
    <div
      role="alert"
      className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-strong"
    >
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">
            {t("dashboard.lowStockTitle", {
              count: items.length,
              threshold: LOW_STOCK_THRESHOLD,
            })}
          </p>
          <ul className="mt-2 space-y-1 text-warning-strong/90">
            {preview.map((item) => (
              <li key={item.name} className="flex justify-between gap-4">
                <span className="truncate">{item.name}</span>
                <span className="font-medium tabular-nums shrink-0">
                  {item.currentStock} {item.unit || t("dashboard.lowStockUnit")}
                </span>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <p className="mt-1 text-xs text-warning-strong">
              {t("dashboard.lowStockMore", { count: remaining })}
            </p>
          )}
          <Link
            href="/inventory/opname"
            className="inline-block mt-2 text-xs font-medium text-warning-strong underline hover:text-warning-strong"
          >
            {t("dashboard.lowStockLink")}
          </Link>
        </div>
      </div>
    </div>
  );
}
