"use client";

import {
  FinanceReportPDFButton,
  type FinanceReportFilters,
} from "@/components/shared/pdf-export-buttons";

/* Saringan halaman, bukan barisnya — laporan dihitung server (09 §5). */
export function FinancePageActions({ filters }: { filters: FinanceReportFilters }) {
  return <FinanceReportPDFButton filters={filters} />;
}
