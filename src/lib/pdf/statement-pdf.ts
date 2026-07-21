/**
 * PDF export for the four financial statements (issue #18):
 * Neraca Saldo, Laba/Rugi, Neraca and Arus Kas.
 *
 * Same approach as every other export in this folder — build a jsPDF document
 * with `jspdf-autotable` and hand it back to the caller to `.save()` — so there
 * is one PDF stack in the app, not two. A single entry point covers all four
 * statements because they share a header, a footer and the same money format;
 * only the table body differs, which is what the tagged `StatementPayload`
 * selects on.
 *
 * Every figure is IDR base (see the header of `src/lib/reports.ts`); the reports
 * never mix currencies, so the export does not either.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { COMPANY_NAME } from "@/lib/constants";

/** A plain, serialisable line — server components pass these to the client button. */
export interface StatementRow {
  code: string;
  name: string;
  amount: number;
}

export interface CashFlowGroupPayload {
  label: string;
  lines: { code: string; name: string; inflow: number; outflow: number; net: number }[];
  inflow: number;
  outflow: number;
  net: number;
}

export type StatementPayload =
  | {
      kind: "trial-balance";
      period: string;
      rows: { code: string; name: string; debit: number; credit: number }[];
      totalDebit: number;
      totalCredit: number;
      balanced: boolean;
    }
  | {
      kind: "income-statement";
      period: string;
      revenue: StatementRow[];
      expense: StatementRow[];
      totalRevenue: number;
      totalExpense: number;
      netIncome: number;
    }
  | {
      kind: "balance-sheet";
      period: string;
      assets: StatementRow[];
      liabilities: StatementRow[];
      equity: StatementRow[];
      totalAssets: number;
      totalLiabilities: number;
      totalEquity: number;
      netIncome: number;
      totalLiabilitiesEquity: number;
      balanced: boolean;
    }
  | {
      kind: "cash-flow";
      period: string;
      groups: CashFlowGroupPayload[];
      totalInflow: number;
      totalOutflow: number;
      netChange: number;
      openingCash: number;
      closingCash: number;
      reconciled: boolean;
      suspectUnrated: number;
    };

export const STATEMENT_TITLES: Record<StatementPayload["kind"], string> = {
  "trial-balance": "Neraca Saldo",
  "income-statement": "Laporan Laba / Rugi",
  "balance-sheet": "Neraca",
  "cash-flow": "Laporan Arus Kas",
};

const BRAND: [number, number, number] = [30, 64, 175]; // --color-primary #1E40AF

/** IDR, id-ID, no decimals — matches `formatCurrency` in the UI so the two agree. */
function rp(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Where the last autoTable finished — jspdf-autotable stashes this on the doc. */
function afterTable(doc: jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY;
}

function header(doc: jsPDF, title: string, period: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, pageWidth / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(12);
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(period, pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")} · Nilai dalam IDR`, pageWidth / 2, y, {
    align: "center",
  });

  return y + 8;
}

/** A section heading + its rows, as one two-column money table. */
function moneySection(
  doc: jsPDF,
  startY: number,
  heading: string,
  rows: StatementRow[],
  totalLabel: string,
  total: number
) {
  autoTable(doc, {
    startY,
    head: [[heading, "Jumlah"]],
    body: rows.length
      ? rows.map((r) => [`${r.code}  ${r.name}`, rp(r.amount)])
      : [["Tidak ada data.", "-"]],
    foot: [[totalLabel, rp(total)]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  return afterTable(doc) + 8;
}

export function generateStatementPDF(payload: StatementPayload): jsPDF {
  const doc = new jsPDF();
  let y = header(doc, STATEMENT_TITLES[payload.kind], payload.period);

  if (payload.kind === "trial-balance") {
    autoTable(doc, {
      startY: y,
      head: [["Kode", "Nama Akun", "Debit", "Kredit"]],
      body: payload.rows.length
        ? payload.rows.map((r) => [
            r.code,
            r.name,
            r.debit > 0 ? rp(r.debit) : "-",
            r.credit > 0 ? rp(r.credit) : "-",
          ])
        : [["", "Belum ada saldo.", "-", "-"]],
      foot: [
        [
          "",
          payload.balanced ? "Total (Seimbang)" : "Total (TIDAK SEIMBANG)",
          rp(payload.totalDebit),
          rp(payload.totalCredit),
        ],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    });
  }

  if (payload.kind === "income-statement") {
    y = moneySection(doc, y, "Pendapatan", payload.revenue, "Total Pendapatan", payload.totalRevenue);
    y = moneySection(doc, y, "Beban", payload.expense, "Total Beban", payload.totalExpense);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const label = payload.netIncome >= 0 ? "LABA BERSIH" : "RUGI BERSIH";
    doc.text(label, 14, y + 2);
    doc.text(rp(payload.netIncome), doc.internal.pageSize.getWidth() - 14, y + 2, {
      align: "right",
    });
  }

  if (payload.kind === "balance-sheet") {
    y = moneySection(doc, y, "Aset", payload.assets, "Total Aset", payload.totalAssets);
    y = moneySection(doc, y, "Liabilitas", payload.liabilities, "Total Liabilitas", payload.totalLiabilities);
    y = moneySection(
      doc,
      y,
      "Ekuitas",
      [...payload.equity, { code: "", name: "Laba / Rugi Berjalan", amount: payload.netIncome }],
      "Total Ekuitas",
      payload.totalEquity + payload.netIncome
    );

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(
      payload.balanced
        ? "Aset = Liabilitas + Ekuitas (Seimbang)"
        : "Aset =/= Liabilitas + Ekuitas (TIDAK SEIMBANG)",
      14,
      y + 2
    );
    doc.text(rp(payload.totalLiabilitiesEquity), doc.internal.pageSize.getWidth() - 14, y + 2, {
      align: "right",
    });
  }

  if (payload.kind === "cash-flow") {
    autoTable(doc, {
      startY: y,
      head: [["Keterangan", "Masuk", "Keluar", "Bersih"]],
      body: [
        ["Kas & setara kas awal periode", "", "", rp(payload.openingCash)],
        // Empty groups are skipped, but a non-empty "Belum Terkategori" is printed
        // like any other section — never merged into operating, never omitted.
        ...payload.groups.flatMap((g) =>
          g.lines.length
            ? [
                [g.label.toUpperCase(), "", "", ""],
                ...g.lines.map((l) => [
                  `   ${l.code}  ${l.name}`,
                  l.inflow > 0 ? rp(l.inflow) : "-",
                  l.outflow > 0 ? rp(l.outflow) : "-",
                  rp(l.net),
                ]),
                [`Jumlah ${g.label}`, rp(g.inflow), rp(g.outflow), rp(g.net)],
              ]
            : []
        ),
        ["Kas & setara kas akhir periode", "", "", rp(payload.closingCash)],
      ],
      foot: [
        [
          payload.reconciled
            ? "KENAIKAN / PENURUNAN KAS (cocok dengan buku besar)"
            : "KENAIKAN / PENURUNAN KAS (TIDAK COCOK — periksa buku besar)",
          rp(payload.totalInflow),
          rp(payload.totalOutflow),
          rp(payload.netChange),
        ],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    if (payload.suspectUnrated > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Catatan: ${payload.suspectUnrated} baris mata uang asing tercatat dengan kurs 1. Nilai IDR-nya perlu diperiksa.`,
        14,
        afterTable(doc) + 6
      );
    }
  }

  return doc;
}
