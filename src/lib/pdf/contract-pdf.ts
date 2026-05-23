import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY_NAME = "PT Subur Anugerah Indonesia";
const COMPANY_ADDRESS = "Komplek Pergudangan Kapuk Ecopark, Jakarta, Indonesia";
const COMPANY_PHONE = "021-XXXXXXX";

interface ContractData {
  contractNo: string;
  date: string;
  buyer: string;
  consignee: string | null;
  packaging: string | null;
  shipment: string | null;
  top1: string | null;
  top2: string | null;
  currency: string;
  status: string;
  items: {
    itemName: string;
    bags: number;
    kgPerBag: number;
    pricePerKg: number;
  }[];
  payments: {
    date: string;
    amount: number;
    currency: string;
    note: string | null;
  }[];
}

function formatCurrency(amount: number, currency: string): string {
  try {
    const localeMap: Record<string, string> = { IDR: "id-ID", USD: "en-US", CNY: "zh-CN" };
    return new Intl.NumberFormat(localeMap[currency] || "id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function generateContractPDF(contract: ContractData) {
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
  y += 4;
  doc.text(`Tel: ${COMPANY_PHONE}`, pageWidth / 2, y, { align: "center" });
  y += 3;

  // Divider
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("SALES CONTRACT", pageWidth / 2, y, { align: "center" });
  y += 10;

  // Contract info
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const info = [
    ["Contract No", contract.contractNo],
    ["Date", formatDate(contract.date)],
    ["Buyer", contract.buyer],
    ["Consignee", contract.consignee || "-"],
    ["Currency", contract.currency],
    ["Status", contract.status.toUpperCase()],
  ];

  if (contract.packaging) info.push(["Packaging", contract.packaging]);
  if (contract.shipment) info.push(["Shipment", contract.shipment]);
  if (contract.top1) info.push(["Terms of Payment 1", contract.top1]);
  if (contract.top2) info.push(["Terms of Payment 2", contract.top2]);

  for (const [label, value] of info) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 65, y);
    y += 6;
  }

  y += 5;

  // Items table
  const totalValue = contract.items.reduce(
    (sum, item) => sum + item.bags * item.kgPerBag * item.pricePerKg,
    0
  );

  autoTable(doc, {
    startY: y,
    head: [["No", "Item", "Bags", "Kg/Bag", "Price/Kg", "Total"]],
    body: contract.items.map((item, i) => {
      const total = item.bags * item.kgPerBag * item.pricePerKg;
      return [
        String(i + 1),
        item.itemName,
        String(item.bags),
        String(item.kgPerBag),
        formatCurrency(item.pricePerKg, contract.currency),
        formatCurrency(total, contract.currency),
      ];
    }),
    foot: [["", "", "", "", "TOTAL", formatCurrency(totalValue, contract.currency)]],
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  // Get current Y after table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // Payments section (if any)
  if (contract.payments.length > 0) {
    const totalPaid = contract.payments.reduce((sum, p) => sum + p.amount, 0);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Payment History", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Date", "Amount", "Currency", "Note"]],
      body: contract.payments.map((p) => [
        formatDate(p.date),
        formatCurrency(p.amount, p.currency),
        p.currency,
        p.note || "-",
      ]),
      foot: [["", formatCurrency(totalPaid, contract.currency), "", `${Math.round((totalPaid / totalValue) * 100)}% paid`]],
      theme: "grid",
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString("id-ID")} — Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  return doc;
}
