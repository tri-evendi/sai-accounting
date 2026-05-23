import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { COMPANY_NAME, CASH_TYPE_LABELS, type CashType } from "@/lib/constants";

export interface FinanceReportRow {
  date: string;
  type: string;
  description: string;
  currency: string;
  debit: number;
  credit: number;
}

export interface FinanceBalanceRow {
  type: string;
  currency: string;
  debit: number;
  credit: number;
  balance: number;
}

function formatMoney(amount: number, currency: string): string {
  try {
    const localeMap: Record<string, string> = { IDR: "id-ID", USD: "en-US", CNY: "zh-CN" };
    return new Intl.NumberFormat(localeMap[currency] || "id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function generateFinanceReportPDF(
  balances: FinanceBalanceRow[],
  transactions: FinanceReportRow[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(12);
  doc.text("Finance Report", pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toLocaleString("id-ID")}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Balance Summary", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Account", "Currency", "Income", "Expense", "Balance"]],
    body: balances.map((b) => [
      CASH_TYPE_LABELS[b.type as CashType] || b.type,
      b.currency,
      formatMoney(b.debit, b.currency),
      formatMoney(b.credit, b.currency),
      formatMoney(b.balance, b.currency),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 12;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Recent Transactions", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Account", "Description", "Cur", "Income", "Expense"]],
    body: transactions.slice(0, 50).map((t) => [
      new Date(t.date).toLocaleDateString("id-ID"),
      CASH_TYPE_LABELS[t.type as CashType] || t.type,
      t.description.length > 40 ? `${t.description.slice(0, 37)}...` : t.description,
      t.currency,
      t.debit > 0 ? formatMoney(t.debit, t.currency) : "-",
      t.credit > 0 ? formatMoney(t.credit, t.currency) : "-",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  return doc;
}
