"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, FileText, Truck, Package, Wallet } from "lucide-react";
import type { ClientInventoryItem } from "@/lib/inventory";
import type { FinanceBalanceRow, FinanceReportRow } from "@/lib/pdf/finance-report-pdf";
import { useToast } from "@/components/ui/toast";

interface ContractPDFData {
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
  items: { itemName: string; bags: number; kgPerBag: number; pricePerKg: number }[];
  payments: { date: string; amount: number; currency: string; note: string | null }[];
}

export function ContractPDFButton({ contract }: { contract: ContractPDFData }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const { generateContractPDF } = await import("@/lib/pdf/contract-pdf");
      const doc = generateContractPDF(contract);
      doc.save(`Contract_${contract.contractNo}.pdf`);
      toast("PDF downloaded");
    } catch (err) {
      console.error(err);
      toast("Failed to generate PDF", "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading}>
      <FileDown className="h-4 w-4 mr-1" />
      {loading ? "Generating..." : "Export PDF"}
    </Button>
  );
}

export function ShippingDocButton({ contract }: { contract: ContractPDFData }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const { generateShippingPDF } = await import("@/lib/pdf/shipping-pdf");
      const doc = generateShippingPDF({
        contractNo: contract.contractNo,
        date: contract.date,
        buyer: contract.buyer,
        consignee: contract.consignee,
        shipment: contract.shipment,
        items: contract.items.map((i) => ({
          itemName: i.itemName,
          bags: i.bags,
          kgPerBag: i.kgPerBag,
        })),
      });
      doc.save(`SuratJalan_${contract.contractNo}.pdf`);
      toast("Shipping document downloaded");
    } catch (err) {
      console.error(err);
      toast("Failed to generate PDF", "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading}>
      <Truck className="h-4 w-4 mr-1" />
      {loading ? "Generating..." : "Surat Jalan"}
    </Button>
  );
}

interface InvoicePDFData {
  invoiceNo: string;
  date: string;
  status: string;
  currency?: string;
  taxAmount?: number;
  customerName?: string | null;
  items: { itemName: string; quantity: number; price: number; unit: string | null }[];
  payments: { date: string; amount: number; currency: string; note: string | null }[];
}

export function StockReportPDFButton({ items }: { items: ClientInventoryItem[] }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const { generateStockReportPDF } = await import("@/lib/pdf/stock-report-pdf");
      const doc = generateStockReportPDF(items);
      doc.save(`Stock_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast("Stock report downloaded");
    } catch (err) {
      console.error(err);
      toast("Failed to generate stock report", "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading || items.length === 0}>
      <Package className="h-4 w-4 mr-1" />
      {loading ? "Generating..." : "Export Stock PDF"}
    </Button>
  );
}

export function FinanceReportPDFButton({
  balances,
  transactions,
}: {
  balances: FinanceBalanceRow[];
  transactions: FinanceReportRow[];
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const { generateFinanceReportPDF } = await import("@/lib/pdf/finance-report-pdf");
      const doc = generateFinanceReportPDF(balances, transactions);
      doc.save(`Finance_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast("Finance report downloaded");
    } catch (err) {
      console.error(err);
      toast("Failed to generate finance report", "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading}>
      <Wallet className="h-4 w-4 mr-1" />
      {loading ? "Generating..." : "Export Finance PDF"}
    </Button>
  );
}

export function InvoicePDFButton({ invoice }: { invoice: InvoicePDFData }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setLoading(true);
    try {
      const { generateInvoicePDF } = await import("@/lib/pdf/invoice-pdf");
      const doc = generateInvoicePDF(invoice);
      doc.save(`Invoice_${invoice.invoiceNo}.pdf`);
      toast("PDF downloaded");
    } catch (err) {
      console.error(err);
      toast("Failed to generate PDF", "error");
    }
    setLoading(false);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={loading}>
      <FileText className="h-4 w-4 mr-1" />
      {loading ? "Generating..." : "Export PDF"}
    </Button>
  );
}
