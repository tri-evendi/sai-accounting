/**
 * Bentuk Laporan Perubahan Ekuitas — penjaga KESAMAAN antara layar, PDF, dan
 * lembar sebar (berkas sejak keputusan pemilik 23 Okt 2026).
 *
 * Pola `tests/cash-flow-shape.test.ts`: SATU payload lewat ketiga perender,
 * dibandingkan baris demi baris dengan bentuk kanonik `equityStatementLayout()`.
 * Yang dibandingkan: jumlah & urutan baris, labelnya, dan keadaan tiap sel
 * nominal (tak berlaku / bernilai). Rupa penulisan angka tidak — lembar sebar
 * menyimpan ANGKA, kertas menulis rupiah.
 *
 * Layar dibaca dari SUMBER halamannya: ia server component yang memanggil
 * buku besar, dan yang dijaga di sini adalah bahwa ia menggambar baris dari
 * penentu yang sama dengan kedua berkasnya — bukan menyusun barisnya sendiri
 * seperti sebelum laporan ini punya kertas.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import id from "@sai/core/i18n/dictionaries/id.json";
import { translate } from "@sai/core/i18n/dictionary";
import { buildReportSheet } from "@/lib/report-export";
import { equityStatementPrintRows, type StatementPayload } from "@/lib/pdf/statement-pdf";
import { equityChangesPayload } from "@/lib/report-payload";
import {
  EQUITY_STATEMENT_COLUMNS,
  EQUITY_STATEMENT_HEADERS,
  EQUITY_STATEMENT_PRINT_LABELS,
  equityStatementLayout,
} from "@/lib/statement-layout";
import { AKAR_REPO } from "./akar-sumber";

type EquityPayload = Extract<StatementPayload, { kind: "equity-changes" }>;

const t = (key: string) => translate(id, key);

const STATEMENT = {
  components: [
    { code: "3101", name: "Modal Disetor", opening: 500_000_000, additions: 500_000_000, reductions: 0, closing: 1_000_000_000 },
    { code: "3102", name: "Laba Ditahan", opening: 120_000_000, additions: 80_000_000, reductions: 0, closing: 200_000_000 },
    /* Setoran DAN prive di periode yang sama — dua kolom, tidak saling meniadakan. */
    { code: "3103", name: "Prive", opening: 0, additions: 0, reductions: 500_000_000, closing: -500_000_000 },
  ],
  /* Rugi: geraknya negatif → kolom KURANG, bukan "penambahan negatif". */
  unclosedIncome: { opening: 80_000_000, movement: -95_000_000, closing: -15_000_000 },
  totalOpening: 700_000_000,
  totalClosing: 685_000_000,
};

const payload: EquityPayload = equityChangesPayload(
  new Date(2026, 0, 1),
  new Date(2026, 2, 31, 23, 59, 59, 999),
  STATEMENT
);

describe("Laporan Perubahan Ekuitas — satu bentuk untuk layar, PDF, dan lembar sebar", () => {
  const layout = equityStatementLayout(payload);
  const pdf = equityStatementPrintRows(payload);
  const pdfRows = [...pdf.body, pdf.foot];
  const sheet = buildReportSheet(payload);

  it("ketiganya punya jumlah baris yang sama, sebanyak bentuk kanoniknya", () => {
    expect(layout).toHaveLength(STATEMENT.components.length + 2);
    expect(pdfRows).toHaveLength(layout.length);
    expect(sheet.rows).toHaveLength(layout.length);
  });

  it("label layar (kamus id) = label cetak, baris demi baris", () => {
    const layar = equityStatementLayout(payload, {
      unclosed: t("reports.unclosedIncomeRow"),
      total: t("common.total"),
      note: t("reports.equityReconcileNote"),
    });
    expect(layar.map((r) => r.label)).toEqual(layout.map((r) => r.label));
    expect(pdfRows.map((r) => r[0])).toEqual(layout.map((r) => r.label));
    expect(sheet.rows.map((r) => r[0]!.value)).toEqual(layout.map((r) => r.label));
  });

  it("sel nominal berada di keadaan yang sama di ketiganya", () => {
    layout.forEach((r, i) => {
      const nilai = [r.opening, r.additions, r.reductions, r.closing];
      nilai.forEach((v, k) => {
        const pdfCell = pdfRows[i]![k + 1]!;
        const sheetCell = sheet.rows[i]![k + 1]!;
        if (v === null) {
          expect(pdfCell, `${r.label} kolom ${k + 1}`).toBe("");
          expect(sheetCell.value, `${r.label} kolom ${k + 1}`).toBeNull();
        } else {
          expect(pdfCell, `${r.label} kolom ${k + 1}`).not.toBe("");
          /* Nol tetap ANGKA di lembar sebar — kolomnya harus bisa dijumlah. */
          expect(sheetCell.value, `${r.label} kolom ${k + 1}`).toBe(v);
        }
      });
    });
  });

  it("laba belum ditutup SELALU tampil; rugi di kolom kurang", () => {
    const un = layout.find((r) => r.kind === "unclosed")!;
    expect(un.label).toBe(EQUITY_STATEMENT_PRINT_LABELS.unclosed);
    expect(un.additions).toBe(0);
    expect(un.reductions).toBe(95_000_000);
    const kosong = equityStatementLayout({
      components: [],
      unclosedIncome: { opening: 0, movement: 0, closing: 0 },
      totalOpening: 0,
      totalClosing: 0,
    });
    expect(kosong.map((r) => r.kind)).toEqual(["unclosed", "total"]);
  });

  it("Total: tambah & kurang tidak berlaku; hanya Total yang tebal di lembar sebar", () => {
    const total = layout[layout.length - 1]!;
    expect(total.kind).toBe("total");
    expect(total.additions).toBeNull();
    expect(total.reductions).toBeNull();
    expect(sheet.rows.map((r) => r[0]!.bold)).toEqual(layout.map((r) => r.kind === "total"));
  });

  it("judul kolom kertas dan lembar sebar dari satu tabel", () => {
    expect(sheet.columns.map((c) => c.header)).toEqual(
      EQUITY_STATEMENT_COLUMNS.map((c) => EQUITY_STATEMENT_HEADERS[c])
    );
  });

  it("halaman menggambar dari penentu yang sama, dari payload yang sama dengan tombolnya", () => {
    const halaman = readFileSync(
      join(
        AKAR_REPO,
        "src", "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]",
        "reports", "equity-changes", "page.tsx"
      ),
      "utf8"
    );
    expect(halaman).toContain("equityChangesPayload(from, to, statement)");
    expect(halaman).toContain("equityStatementLayout(payload,");
    expect(halaman).toMatch(/<StatementPDFButton payload=\{payload\} \/>/);
    expect(halaman).toMatch(/<StatementExcelButton\s+payload=\{payload\}/);
    /* Arah gerak laba belum ditutup tidak lagi diputuskan halaman. */
    expect(halaman).not.toMatch(/gerak > 0 \? gerak : 0/);
  });
});
