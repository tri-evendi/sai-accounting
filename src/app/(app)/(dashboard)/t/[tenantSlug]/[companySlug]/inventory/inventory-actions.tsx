"use client";

import { StockReportPDFButton } from "@/components/shared/pdf-export-buttons";
import type { ClientInventoryItem } from "@/lib/inventory";

export function InventoryPageActions({ items }: { items: ClientInventoryItem[] }) {
  return <StockReportPDFButton items={items} />;
}
