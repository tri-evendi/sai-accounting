"use client";

import { FinanceReportPDFButton } from "@/components/shared/pdf-export-buttons";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";

export function FinancePageActions({
  balances,
  transactions,
}: {
  balances: FinanceBalanceRow[];
  transactions: FinanceReportRow[];
}) {
  return <FinanceReportPDFButton balances={balances} transactions={transactions} />;
}
