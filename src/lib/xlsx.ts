/**
 * Thin ExcelJS adapter (issue #19) — the ONLY module that imports a spreadsheet
 * library. It walks a `SheetModel` (built by the pure `@/lib/report-export`) into
 * an `.xlsx` buffer and does nothing else: no figure is computed here, no value is
 * re-rounded. Server-side only — ExcelJS is a Node library and the export runs in
 * an API route, never in the browser.
 *
 * ExcelJS is chosen because it is a maintained, dependency-light, pure-JS writer
 * with first-class number-format and styling support — so money cells go in as
 * real numbers (summable, exact) with an id-ID display format, rather than as
 * pre-formatted strings that would lose both precision and the ability to total.
 */
import ExcelJS from "exceljs";
import { COMPANY_NAME } from "@/lib/constants";
import { IDR_NUMBER_FORMAT, type SheetModel } from "@/lib/report-export";

/**
 * Render one or more sheet models into a single workbook buffer.
 * Each model becomes its own worksheet, title + period as banner rows, then the
 * column headers, then the data rows with per-cell format and weight applied.
 */
export async function buildWorkbookBuffer(models: SheetModel[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();

  // ExcelJS rejects duplicate worksheet names; disambiguate while respecting the
  // 31-char tab-name limit, so exporting two of the same report never throws.
  const usedNames = new Set<string>();
  const uniqueName = (base: string): string => {
    let name = base.slice(0, 31);
    for (let i = 2; usedNames.has(name); i += 1) {
      const suffix = ` (${i})`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    usedNames.add(name);
    return name;
  };

  for (const model of models) {
    const ws = wb.addWorksheet(uniqueName(model.name));
    const colCount = model.columns.length;

    // Banner: company, report title, period. Kept visually distinct via weight.
    ws.addRow([COMPANY_NAME]).font = { bold: true, size: 14 };
    ws.addRow([model.title]).font = { bold: true, size: 12 };
    ws.addRow([model.period]).font = { color: { argb: "FF64748B" } };
    ws.addRow([`Dicetak: ${new Date().toLocaleString("id-ID")} · Nilai dalam IDR`]).font = {
      size: 9,
      color: { argb: "FF64748B" },
    };
    ws.addRow([]);

    // Column widths and the header row.
    model.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width;
    });
    const headerRow = ws.addRow(model.columns.map((c) => c.header));
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (let i = 1; i <= colCount; i += 1) {
      const cell = headerRow.getCell(i);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { horizontal: i === 1 ? "left" : "right" };
    }

    // Data rows.
    for (const cells of model.rows) {
      const row = ws.addRow(cells.map((c) => c.value ?? null));
      cells.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.format === "money") cell.numFmt = IDR_NUMBER_FORMAT;
        if (c.bold) cell.font = { bold: true };
        if (c.align) cell.alignment = { horizontal: c.align };
      });
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
