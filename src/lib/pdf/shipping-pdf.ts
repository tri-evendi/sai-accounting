import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY_NAME = "PT Subur Anugerah Indonesia";
const COMPANY_ADDRESS = "Komplek Pergudangan Kapuk Ecopark, Jakarta, Indonesia";

interface ShippingDocData {
  contractNo: string;
  date: string;
  buyer: string;
  consignee: string | null;
  shipment: string | null;
  items: {
    itemName: string;
    bags: number;
    kgPerBag: number;
  }[];
}

export function generateShippingPDF(data: ShippingDocData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header
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

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("SURAT JALAN", pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("(Shipping Document)", pageWidth / 2, y, { align: "center" });
  y += 10;

  // Info
  const info = [
    ["Contract No", data.contractNo],
    ["Date", new Date(data.date).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })],
    ["Buyer", data.buyer],
    ["Consignee", data.consignee || "-"],
    ["Shipment", data.shipment || "-"],
  ];

  doc.setFontSize(10);
  for (const [label, value] of info) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, y);
    y += 6;
  }

  y += 5;

  // Items
  const totalWeight = data.items.reduce((sum, item) => sum + item.bags * item.kgPerBag, 0);

  autoTable(doc, {
    startY: y,
    head: [["No", "Item", "Bags", "Kg/Bag", "Total Weight (kg)"]],
    body: data.items.map((item, i) => [
      String(i + 1),
      item.itemName,
      String(item.bags),
      String(item.kgPerBag),
      String(item.bags * item.kgPerBag),
    ]),
    foot: [["", "", "", "TOTAL", `${totalWeight.toLocaleString()} kg`]],
    theme: "grid",
    headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 25;

  // Signature block
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const col1 = 30;
  const col2 = pageWidth - 60;

  doc.text("Prepared by,", col1, y, { align: "center" });
  doc.text("Received by,", col2, y, { align: "center" });

  y += 30;
  doc.line(col1 - 25, y, col1 + 25, y);
  doc.line(col2 - 25, y, col2 + 25, y);

  y += 5;
  doc.setFontSize(8);
  doc.text("(Name & Signature)", col1, y, { align: "center" });
  doc.text("(Name & Signature)", col2, y, { align: "center" });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("id-ID")}`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: "center" }
  );

  return doc;
}
