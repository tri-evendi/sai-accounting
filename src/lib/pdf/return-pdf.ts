import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY_NAME = "PT Subur Anugerah Indonesia";
const COMPANY_ADDRESS = "Komplek Pergudangan Kapuk Ecopark, Jakarta, Indonesia";

export interface ReturnPdfData {
  kind: "sales" | "purchase";
  returnNo: string;
  date: string;
  /** Origin document number/label (invoice no. or purchase reference). */
  originLabel: string;
  /** Customer (sales) or supplier (purchase) name. */
  partyName?: string | null;
  currency?: string;
  taxAmount?: number;
  taxRate?: number | null;
  reason?: string | null;
  items: {
    itemName: string;
    quantity: number;
    price: number;
  }[];
}

function formatCurrency(amount: number, currency: string = "IDR"): string {
  try {
    const localeMap: Record<string, string> = { IDR: "id-ID", USD: "en-US", CNY: "zh-CN" };
    return new Intl.NumberFormat(localeMap[currency] || "id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("id-ID")}`;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Nota Retur — sales or purchase return document (issue #27). */
export function generateReturnPDF(data: ReturnPdfData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY_ADDRESS, pageWidth / 2, y, { align: "center" });
  y += 3;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  const title = data.kind === "sales" ? "NOTA RETUR PENJUALAN" : "NOTA RETUR PEMBELIAN";
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(10);
  const infoRows: [string, string][] = [
    ["No. Retur", data.returnNo],
    ["Tanggal", formatDate(data.date)],
    [data.kind === "sales" ? "Faktur Asal" : "Pembelian Asal", data.originLabel],
    ["Mata Uang", data.currency || "IDR"],
    ...(data.partyName
      ? ([[data.kind === "sales" ? "Pelanggan" : "Supplier", data.partyName]] as [string, string][])
      : []),
  ];
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, y);
    y += 6;
  }
  y += 5;

  const currency = data.currency || "IDR";
  const taxAmount = data.taxAmount ?? 0;
  const subtotal = data.items.reduce((s, it) => s + it.quantity * it.price, 0);
  const total = subtotal + taxAmount;
  const ppnLabel =
    taxAmount > 0
      ? `PPN (${data.taxRate != null ? data.taxRate : ""}%)`.replace(" ()", "")
      : "PPN 0%";

  autoTable(doc, {
    startY: y,
    head: [["No", "Barang", "Qty", "Harga", "Jumlah"]],
    body: data.items.map((it, i) => [
      String(i + 1),
      it.itemName,
      String(it.quantity),
      formatCurrency(it.price, currency),
      formatCurrency(it.quantity * it.price, currency),
    ]),
    foot: [
      ["", "", "", "DPP", formatCurrency(subtotal, currency)],
      ["", "", "", ppnLabel, formatCurrency(taxAmount, currency)],
      ["", "", "", `TOTAL (${currency})`, formatCurrency(total, currency)],
    ],
    theme: "grid",
    headStyles: { fillColor: [142, 68, 173], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  if (data.reason) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Alasan:", 14, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.reason, pageWidth - 40);
    doc.text(lines, 34, y);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      `Dicetak ${new Date().toLocaleDateString("id-ID")} — Hal ${i} dari ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  return doc;
}
