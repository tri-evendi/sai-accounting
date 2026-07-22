import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";

export type LowStockAlertItem = {
  name: string;
  currentStock: number;
  unit: string | null;
};

export function StockAlertBanner({ items }: { items: LowStockAlertItem[] }) {
  if (items.length === 0) return null;

  const preview = items.slice(0, 5);
  const remaining = items.length - preview.length;

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">
            Stok menipis — {items.length} barang tersisa {LOW_STOCK_THRESHOLD} satuan atau kurang
          </p>
          <ul className="mt-2 space-y-1 text-amber-900/90">
            {preview.map((item) => (
              <li key={item.name} className="flex justify-between gap-4">
                <span className="truncate">{item.name}</span>
                <span className="font-medium tabular-nums shrink-0">
                  {item.currentStock} {item.unit || "satuan"}
                </span>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <p className="mt-1 text-xs text-amber-800">+{remaining} barang lain di daftar stok</p>
          )}
          <Link
            href="/inventory/opname"
            className="inline-block mt-2 text-xs font-medium text-amber-800 underline hover:text-amber-950"
          >
            Periksa lewat Hitung Ulang Stok
          </Link>
        </div>
      </div>
    </div>
  );
}
