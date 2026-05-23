import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY_NAME = "PT Subur Anugerah Indonesia";
const COMPANY_ADDRESS = "Komplek Pergudangan Kapuk Ecopark, Jakarta, Indonesia";

interface InvoiceData {
  invoiceNo: string;
  date: string;
  status: string;
  items: {
    itemName: string;
    quantity: number;
    price: number;
    unit: string | null;
  }[];
  payments: {
    date: string;
    amount: number;
    currency: string;
    note: string | null;
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

export function generateInvoicePDF(invoice: InvoiceData) {
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
  doc.text("INVOICE", pageWidth / 2, y, { align: "center" });
  y += 10;

  // Info
  doc.setFontSize(10);
  const infoRows = [
    ["Invoice No", invoice.invoiceNo],
    ["Date", formatDate(invoice.date)],
    ["Status", invoice.status.toUpperCase()],
  ];

  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, y);
    y += 6;
  }

  y += 5;

  // Items table
  const totalValue = invoice.items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );

  autoTable(doc, {
    startY: y,
    head: [["No", "Item", "Unit", "Quantity", "Price", "Total"]],
    body: invoice.items.map((item, i) => {
      const total = item.quantity * item.price;
      return [
        String(i + 1),
        item.itemName,
        item.unit || "-",
        String(item.quantity),
        formatCurrency(item.price),
        formatCurrency(total),
      ];
    }),
    foot: [["", "", "", "", "TOTAL", formatCurrency(totalValue)]],
    theme: "grid",
    headStyles: { fillColor: [142, 68, 173], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // Payments
  if (invoice.payments.length > 0) {
    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Payment History", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Date", "Amount", "Currency", "Note"]],
      body: invoice.payments.map((p) => [
        formatDate(p.date),
        formatCurrency(p.amount, p.currency),
        p.currency,
        p.note || "-",
      ]),
      foot: [["Total Paid", formatCurrency(totalPaid), "", ""]],
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
