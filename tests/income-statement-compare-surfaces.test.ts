/**
 * LABA RUGI KOMPARATIF — satu bentuk untuk layar, PDF, dan lembar sebar (#557).
 *
 * ══ Kenapa penjaga ini ada ═════════════════════════════════════════════════
 * Kolom pembanding ditaruh di `incomeStatementLayout()` justru supaya ketiga
 * permukaan tidak bisa berbeda. Penjaga itu hanya berarti kalau ada yang
 * MEMERIKSANYA — dan pendahulunya (#274/#241) lahir persis karena cetakan
 * pernah membuat pernyataan yang layarnya sengaja tolak keluarkan.
 *
 * Yang paling mungkin salah di sini bukan angkanya melainkan JUMLAH KOLOM:
 * satu permukaan menggambar empat kolom, yang lain masih dua, dan laporan yang
 * dicetak diam-diam kehilangan separuh isinya.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import id from "@/lib/i18n/dictionaries/id.json";
import { translate } from "@/lib/i18n/dictionary";
import { buildReportSheet } from "@/lib/report-export";
import { incomeStatementPrintRows } from "@/lib/pdf/statement-pdf";
import { IncomeStatementTable } from "@/components/reports/income-statement-table";
import type { IncomeStatementPayload } from "@/components/reports/income-statement-table";

const t = ((k: string, v?: Record<string, string | number>) =>
  translate(id, k, v)) as never;

const band = (lines: { code: string; name: string; amount: number }[]) => ({
  lines,
  total: lines.reduce((s, l) => s + l.amount, 0),
});
const kosong = band([]);

const PAYLOAD: IncomeStatementPayload = {
  kind: "income-statement",
  period: "1 Jan – 31 Jan 2026",
  priorPeriod: "1 Jan – 31 Jan 2025",
  sales: band([{ code: "4101", name: "Penjualan", amount: 1_200 }]),
  cogs: kosong,
  grossProfit: 1_200,
  operatingExpense: band([{ code: "6101", name: "Beban Gaji", amount: 500 }]),
  operatingProfit: 700,
  otherIncome: kosong,
  otherExpense: kosong,
  netIncome: 700,
  prior: {
    sales: band([{ code: "4101", name: "Penjualan", amount: 1_000 }]),
    cogs: kosong,
    grossProfit: 1_000,
    operatingExpense: band([
      { code: "6101", name: "Beban Gaji", amount: 400 },
      { code: "6109", name: "Beban Lama", amount: 30 },
    ]),
    operatingProfit: 570,
    otherIncome: kosong,
    otherExpense: kosong,
    netIncome: 570,
  },
} as IncomeStatementPayload;

const textOf = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function screenHead(): string[] {
  const markup = renderToStaticMarkup(createElement(IncomeStatementTable, { payload: PAYLOAD, t }));
  const head = markup.match(/<thead\b[\s\S]*?<\/thead>/)?.[0] ?? "";
  return [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
}

function screenRowCount(): number {
  const markup = renderToStaticMarkup(createElement(IncomeStatementTable, { payload: PAYLOAD, t }));
  const body = markup.match(/<tbody\b[\s\S]*?<\/tbody>/)?.[0] ?? "";
  const foot = markup.match(/<tfoot\b[\s\S]*?<\/tfoot>/)?.[0] ?? "";
  return (
    [...body.matchAll(/<tr\b/g)].length + [...foot.matchAll(/<tr\b/g)].length
  );
}

describe("ketiganya sepakat dalam mode komparatif", () => {
  const { body, foot } = incomeStatementPrintRows(PAYLOAD);
  const cetak = [...body, ...foot];
  const lembar = buildReportSheet(PAYLOAD);

  it("PDF dan lembar sebar menggambar EMPAT kolom, bukan dua", () => {
    /* Bentuk kegagalan yang paling mungkin: satu permukaan tertinggal di dua
       kolom dan cetakannya kehilangan separuh laporan tanpa satu galat pun. */
    for (const row of cetak) expect(row).toHaveLength(4);
    expect(lembar.columns).toHaveLength(4);
    for (const row of lembar.rows) expect(row).toHaveLength(4);
  });

  it("layar juga empat kolom, dan judulnya menyebut PERIODE-nya", () => {
    const head = screenHead();
    expect(head).toHaveLength(4);
    /* Judul kolom pembanding adalah tanggalnya sendiri, bukan "Tahun Lalu" —
       pembandingnya bisa periode sebelumnya ATAU tahun lalu, dan judul tetap
       yang berbohong tentang mana yang dipakai lebih buruk daripada yang
       panjang. */
    expect(head[1]).toContain("2026");
    expect(head[2]).toContain("2025");
  });

  it("ketiganya punya jumlah baris yang sama", () => {
    expect(screenRowCount()).toBe(cetak.length);
    expect(lembar.rows).toHaveLength(cetak.length);
  });

  it("akun yang hanya ada di periode lalu muncul di SEMUA permukaan", () => {
    const adaDiCetak = cetak.some((r) => r[0].includes("Beban Lama"));
    const adaDiLembar = lembar.rows.some((r) => String(r[0].value ?? "").includes("Beban Lama"));
    const markup = renderToStaticMarkup(
      createElement(IncomeStatementTable, { payload: PAYLOAD, t })
    );
    expect(adaDiCetak).toBe(true);
    expect(adaDiLembar).toBe(true);
    expect(markup).toContain("Beban Lama");
  });

  it("lembar sebar menyimpan nominal sebagai ANGKA dan persen sebagai TEKS", () => {
    /* Satu-satunya alasan lembar sebar ada adalah agar kolomnya bisa dijumlah;
       persen yang jadi angka di sebelah rupiah mengundang `SUM` yang tak
       berarti apa-apa. */
    const baris = lembar.rows.find((r) => String(r[0].value ?? "").includes("Penjualan"))!;
    expect(typeof baris[1].value).toBe("number");
    expect(typeof baris[2].value).toBe("number");
    expect(typeof baris[3].value).toBe("string");
  });
});
