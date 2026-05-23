import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { COMPANY_NAME, LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { STOCK_LEVEL_LABELS, getStockLevel, type ClientInventoryItem } from "@/lib/inventory";

export function generateStockReportPDF(items: ClientInventoryItem[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(12);
  doc.text("Stock Report", pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toLocaleString("id-ID")}`, pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.text(`Low stock threshold: ≤ ${LOW_STOCK_THRESHOLD} units`, pageWidth / 2, y, { align: "center" });
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Item", "Unit", "Total In", "Total Out", "On Hand", "Status"]],
    body: items.map((item) => [
      item.name,
      item.unit || "-",
      String(item.totalIn),
      String(item.totalOut),
      String(item.currentStock),
      STOCK_LEVEL_LABELS[getStockLevel(item.currentStock)],
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [22, 101, 52] },
  });

  return doc;
}
