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
import { incomeStatementLayout } from "@/lib/statement-layout";

/** A plain, serialisable line — server components pass these to the client button. */
export interface StatementRow {
  code: string;
  name: string;
  amount: number;
}

/** One band of the multi-step Laba/Rugi, serialisable (issue #123). */
export interface StatementSectionPayload {
  lines: StatementRow[];
  total: number;
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
      sales: StatementSectionPayload;
      cogs: StatementSectionPayload;
      grossProfit: number;
      operatingExpense: StatementSectionPayload;
      operatingProfit: number;
      otherIncome: StatementSectionPayload;
      otherExpense: StatementSectionPayload;
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
  /**
   * Kartu Stok (issue #126). Quantities, not money — every figure here is
   * `Decimal(15,3)` and must never be rendered with the rupiah formatter.
   */
  | {
      kind: "stock-movement";
      period: string;
      rows: {
        name: string;
        unit: string | null;
        opening: number;
        movedIn: number;
        movedOut: number;
        processed: number;
        closing: number;
      }[];
      totalOpening: number;
      totalIn: number;
      totalOut: number;
      totalProcessed: number;
      totalClosing: number;
      hasProcess: boolean;
      dormantCount: number;
    }
  /** Riwayat Hitung Ulang Stok (issue #129). Quantities, signed by direction. */
  | {
      kind: "opname-history";
      period: string;
      sessions: {
        dateISO: string;
        adjustments: { itemName: string; unit: string | null; variance: number }[];
        increase: number;
        decrease: number;
      }[];
      sessionCount: number;
      adjustmentCount: number;
      totalIncrease: number;
      totalDecrease: number;
      netVariance: number;
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
  "stock-movement": "Kartu Stok / Mutasi Persediaan",
  "opname-history": "Riwayat Hitung Ulang Stok (Stok Opname)",
};

/** Kuantitas bertanda: "+40" / "−12,5". Tanda adalah penanda NON-WARNA-nya. */
function signedQty(value: number): string {
  const text = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

/**
 * Quantity, id-ID, up to three decimals with trailing zeros dropped — the screen
 * uses `formatNumber` from `@/lib/utils`, and this must agree with it or the
 * printout and the page would disagree on the same figure.
 */
function qty(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value);
}

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

function header(doc: jsPDF, title: string, period: string, company: { name: string; address: string }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company.name, pageWidth / 2, y, { align: "center" });
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

export function generateStatementPDF(payload: StatementPayload, company: { name: string; address: string }): jsPDF {
  const doc = new jsPDF();
  let y = header(doc, STATEMENT_TITLES[payload.kind], payload.period, company);

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
    const layout = incomeStatementLayout(payload);

    /** A bold subtotal line between two sections (Laba Kotor, Laba Usaha). */
    const subtotal = (label: string, amount: number, atY: number) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(label, 14, atY);
      doc.text(rp(amount), doc.internal.pageSize.getWidth() - 14, atY, { align: "right" });
      return atY + 8;
    };

    y = moneySection(doc, y, "Pendapatan", payload.sales.lines, "Total Pendapatan", payload.sales.total);
    if (layout.showCogs) {
      y = moneySection(
        doc,
        y,
        "Beban Pokok Penjualan",
        payload.cogs.lines,
        "Total Beban Pokok Penjualan",
        payload.cogs.total
      );
    }
    if (layout.showGrossProfit) y = subtotal("LABA KOTOR", payload.grossProfit, y);
    y = moneySection(
      doc,
      y,
      "Beban Operasional",
      payload.operatingExpense.lines,
      "Total Beban Operasional",
      payload.operatingExpense.total
    );
    if (layout.showOperatingProfit) y = subtotal("LABA USAHA", payload.operatingProfit, y);
    if (layout.showOtherIncome) {
      y = moneySection(
        doc,
        y,
        "Pendapatan Lain-lain",
        payload.otherIncome.lines,
        "Total Pendapatan Lain-lain",
        payload.otherIncome.total
      );
    }
    if (layout.showOtherExpense) {
      y = moneySection(
        doc,
        y,
        "Beban Lain-lain",
        payload.otherExpense.lines,
        "Total Beban Lain-lain",
        payload.otherExpense.total
      );
    }

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
      [...payload.equity, { code: "", name: "Akumulasi Laba/Rugi", amount: payload.netIncome }],
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

  if (payload.kind === "stock-movement") {
    // The `Diolah` column appears only when the period actually contains a
    // `process` movement — same rule as the screen (see lib/stock-movement.ts).
    const head = ["Barang", "Satuan", "Saldo Awal", "Masuk", "Keluar"];
    if (payload.hasProcess) head.push("Diolah");
    head.push("Saldo Akhir");

    const row = (r: (typeof payload.rows)[number]) => {
      const cells = [r.name, r.unit || "-", qty(r.opening), qty(r.movedIn), qty(r.movedOut)];
      if (payload.hasProcess) cells.push(qty(r.processed));
      cells.push(qty(r.closing));
      return cells;
    };
    const footer = ["Total", "", qty(payload.totalOpening), qty(payload.totalIn), qty(payload.totalOut)];
    if (payload.hasProcess) footer.push(qty(payload.totalProcessed));
    footer.push(qty(payload.totalClosing));

    // Right-align every numeric column, whichever count this report has.
    const numericFrom = 2;
    const columnStyles: Record<number, { halign: "right" }> = {};
    for (let i = numericFrom; i < head.length; i += 1) columnStyles[i] = { halign: "right" };

    autoTable(doc, {
      startY: y,
      head: [head],
      body: payload.rows.length ? payload.rows.map(row) : [["", "Tidak ada mutasi pada periode ini.", ...Array(head.length - 2).fill("")]],
      foot: [footer],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles,
    });

    // Dormant items are omitted from the table; saying so is what keeps the
    // omission honest rather than making the master look shorter than it is.
    if (payload.dormantCount > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Catatan: ${payload.dormantCount} barang tanpa saldo awal dan tanpa mutasi pada periode ini tidak ditampilkan.`,
        14,
        afterTable(doc) + 6
      );
    }
  }

  if (payload.kind === "opname-history") {
    autoTable(doc, {
      startY: y,
      head: [["Tanggal Hitung", "Barang", "Satuan", "Selisih"]],
      body: payload.sessions.length
        ? payload.sessions.flatMap((s) => [
            [
              { content: `Hitung ulang ${s.dateISO}`, colSpan: 2, styles: { fontStyle: "bold" as const } },
              { content: `Lebih ${signedQty(s.increase)}`, styles: { halign: "right" as const } },
              { content: `Susut ${signedQty(-s.decrease)}`, styles: { halign: "right" as const } },
            ],
            ...s.adjustments.map((a) => ["", `   ${a.itemName}`, a.unit || "-", signedQty(a.variance)]),
          ])
        : [["", "Tidak ada hitung ulang stok pada periode ini.", "", ""]],
      foot: [
        [
          `${payload.sessionCount} kali hitung ulang`,
          `${payload.adjustmentCount} penyesuaian barang`,
          "Selisih bersih",
          signedQty(payload.netVariance),
        ],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      columnStyles: { 3: { halign: "right" } },
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
