"use client";

import { StockReportPDFButton } from "@/components/shared/pdf-export-buttons";

/* Hanya `empty` untuk `disabled` — muatannya dihitung server (09 §5). */
export function InventoryPageActions({ empty }: { empty: boolean }) {
  return <StockReportPDFButton empty={empty} />;
}
