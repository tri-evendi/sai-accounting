"use client";

import {
  StockReportPDFButton,
  FinanceReportPDFButton,
} from "@/components/shared/pdf-export-buttons";
import type { ClientInventoryItem } from "@/lib/inventory";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

export function InventoryExportAction({ items }: { items: ClientInventoryItem[] }) {
  return <StockReportPDFButton items={items} />;
}

export function FinanceExportAction({
  balances,
  transactions,
}: {
  balances: FinanceBalanceRow[];
  transactions: FinanceReportRow[];
}) {
  return <FinanceReportPDFButton balances={balances} transactions={transactions} />;
}
