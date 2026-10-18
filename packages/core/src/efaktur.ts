/**
 * e-Faktur / Coretax (CTAS) export — the PURE column builder (issue #17).
 *
 * Turns output-VAT invoices (faktur keluaran) and export invoices (0% PPN carrying
 * a PEB number) into a flat, one-row-per-invoice table that can be written to CSV
 * and imported into DJP tooling. No Prisma, no I/O — the data layer
 * (`@/lib/efaktur-data`) reads invoices and calls this; the route writes the CSV.
 * Pure so the whole column mapping is unit-testable and adjustable in one place.
 *
 * ── HONEST STATEMENT ON DJP FORMAT FIDELITY ─────────────────────────────────
 * This is a DJP/CTAS-ORIENTED export with the standard faktur-keluaran fields —
 * NOT a byte-exact reproduction of a specific DJP import schema. The precise
 * e-Faktur / Coretax import layout (column names, order, the FK/OF/FAPR record
 * structure of the old desktop importer, transaction/document codes) changes with
 * DJP regulation. So the headers here are CLEAR, DOCUMENTED, English/Indonesian
 * names kept in ONE constant (`EFAKTUR_COLUMNS`) to remap when a target schema is
 * fixed. Validate the output against the CURRENT DJP schema before production
 * filing. We deliberately do NOT invent official kode-transaksi numbers we are
 * unsure of; `jenis` distinguishes lokal vs ekspor in plain terms instead.
 *
 * ── WHAT IS INCLUDED ────────────────────────────────────────────────────────
 * The data layer selects the invoices; this module classifies and validates each:
 *   • LOKAL (domestic, currency = IDR): a faktur keluaran. Buyer NPWP is REQUIRED
 *     — a domestic Faktur Pajak without the lawan-transaksi NPWP fails import, so
 *     a missing one is surfaced as a problem, never emitted blank.
 *   • EKSPOR (foreign currency): PEB replaces the Faktur Pajak. The PEB NUMBER is
 *     REQUIRED; buyer NPWP is not (a foreign buyer has none). A foreign invoice
 *     with no rate has no honest IDR value, so its IDR columns cannot be produced
 *     — that too is surfaced, never guessed at 1:1.
 *   • SELLER NPWP is required for every row. If it is missing, NOTHING can be
 *     filed, so every invoice is reported as missing `npwp_penjual` and no rows
 *     are produced.
 *
 * Currency discipline (issues #35/#16): DPP/PPN are shown in the document's own
 * currency; the IDR base columns are `amount × rate`, blank-and-flagged when the
 * rate is unknown. Amounts across currencies are NEVER summed here — this is a
 * per-row export, and any totalling is the caller's concern per currency.
 */

/** Money → a plain decimal string (2 dp, dot separator, no thousands grouping). */
function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** ISO date/string → `YYYY-MM-DD` (DJP date form). Empty string for null. */
function isoDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Tax period (masa/tahun) from an invoice date. */
function masaTahun(value: string | Date): { masa: string; tahun: string } {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return { masa: "", tahun: "" };
  return {
    masa: String(d.getUTCMonth() + 1).padStart(2, "0"),
    tahun: String(d.getUTCFullYear()),
  };
}

/**
 * The e-Faktur export columns, in stable order. `key` is the object field; `header`
 * is the CSV header. Change a target schema in ONE place: this array.
 */
export const EFAKTUR_COLUMNS: ReadonlyArray<{ key: string; header: string }> = [
  { key: "masa_pajak", header: "masa_pajak" },
  { key: "tahun_pajak", header: "tahun_pajak" },
  { key: "jenis", header: "jenis" },
  { key: "npwp_penjual", header: "npwp_penjual" },
  { key: "nama_penjual", header: "nama_penjual" },
  { key: "nomor_dokumen", header: "nomor_dokumen" },
  { key: "tanggal_dokumen", header: "tanggal_dokumen" },
  { key: "npwp_pembeli", header: "npwp_pembeli" },
  { key: "nama_pembeli", header: "nama_pembeli" },
  { key: "alamat_pembeli", header: "alamat_pembeli" },
  { key: "mata_uang", header: "mata_uang" },
  { key: "dpp", header: "dpp" },
  { key: "ppn", header: "ppn" },
  { key: "tarif_ppn", header: "tarif_ppn" },
  { key: "kurs", header: "kurs" },
  { key: "dpp_idr", header: "dpp_idr" },
  { key: "ppn_idr", header: "ppn_idr" },
  { key: "nomor_peb", header: "nomor_peb" },
  { key: "tanggal_peb", header: "tanggal_peb" },
  { key: "keterangan", header: "keterangan" },
] as const;

/** Seller (penjual) identity — from CompanySetting (issue #17). */
export interface EfakturSeller {
  /** Seller NPWP. Required for every row; a missing one blocks the whole export. */
  npwp: string | null;
  /** Nama sesuai NPWP (falls back to trading name upstream). */
  name: string | null;
}

/** One invoice's fields, as the data layer resolves them (document currency). */
export interface EfakturInvoiceInput {
  invoiceNo: string;
  /** Invoice date (drives masa/tahun and, for lokal, the document date). */
  date: string | Date;
  /** Document currency. `IDR` ⇒ lokal (faktur keluaran); anything else ⇒ ekspor. */
  currency: string;
  /** Rate to IDR; null when unknown. Only needed for a foreign (ekspor) invoice. */
  rate: number | null;
  /** DPP in the document's own currency. */
  dpp: number;
  /** PPN in the document's own currency (0 for export). */
  taxAmount: number;
  /** Effective PPN rate in percent; null when not recorded. */
  taxRate: number | null;
  /** Buyer identity (lawan transaksi). */
  buyerName: string | null;
  buyerNpwp: string | null;
  buyerAddress: string | null;
  /** Export document (PEB). */
  pebNumber: string | null;
  pebDate: string | Date | null;
  /** Free-text export/document note → `keterangan`. */
  exportNote: string | null;
}

/** A built row: header-key → string cell, in `EFAKTUR_COLUMNS` order. */
export type EfakturRow = Record<string, string>;

/** An invoice that cannot be exported because a required field is missing. */
export interface EfakturProblem {
  invoiceNo: string;
  /** Which required column(s) were missing (header keys). */
  missing: string[];
}

export interface EfakturResult {
  columns: typeof EFAKTUR_COLUMNS;
  /** Valid, importable rows only (invoices with problems are excluded). */
  rows: EfakturRow[];
  /** Invoices held back because a required field is missing — surfaced, not blanked. */
  problems: EfakturProblem[];
}

const has = (v: string | null | undefined): boolean => v != null && String(v).trim() !== "";

/** Is this an export invoice? SAI exports are foreign-currency (issue #16/#35). */
export function isExportInvoice(inv: { currency: string }): boolean {
  return (inv.currency || "IDR").toUpperCase() !== "IDR";
}

/** Inclusive tax period, as `YYYY-MM-DD` boundaries (day granularity). */
export interface EfakturPeriod {
  from?: string | Date | null;
  to?: string | Date | null;
}

/**
 * Is an invoice date within [from, to], inclusive, at day granularity? Compared
 * as `YYYY-MM-DD` strings to sidestep time-of-day / timezone drift — an invoice
 * dated on the `to` day is included whatever its time component.
 */
export function withinPeriod(date: string | Date, period?: EfakturPeriod): boolean {
  if (!period) return true;
  const d = isoDate(date);
  if (period.from) {
    const f = isoDate(period.from);
    if (f && d < f) return false;
  }
  if (period.to) {
    const t = isoDate(period.to);
    if (t && d > t) return false;
  }
  return true;
}

/**
 * Build the e-Faktur rows + problem list from the seller identity and invoices.
 *
 * Each invoice is classified lokal/ekspor and validated for the fields its kind
 * requires. Missing-required invoices go to `problems` (never a blank row). When
 * the seller NPWP is absent every invoice is a problem and no rows are produced.
 *
 * `period` (optional) filters invoices to a masa pajak by date, inclusive, at day
 * granularity — an out-of-period invoice is silently excluded (not a problem). The
 * data layer already narrows by date in SQL; passing it here too guarantees the
 * builder never emits an out-of-range row regardless of caller.
 */
export function buildEfaktur(
  seller: EfakturSeller,
  invoices: EfakturInvoiceInput[],
  period?: EfakturPeriod
): EfakturResult {
  const sellerNpwpOk = has(seller.npwp);
  const rows: EfakturRow[] = [];
  const problems: EfakturProblem[] = [];

  for (const inv of invoices) {
    if (!withinPeriod(inv.date, period)) continue;
    const missing: string[] = [];
    if (!sellerNpwpOk) missing.push("npwp_penjual");

    const exportSale = isExportInvoice(inv);
    const foreignNeedsRate = exportSale && !(inv.rate != null && inv.rate > 0);

    if (exportSale) {
      // PEB replaces the Faktur Pajak on an export sale — its number is required.
      if (!has(inv.pebNumber)) missing.push("nomor_peb");
      // A foreign invoice with no rate has no honest IDR value to report.
      if (foreignNeedsRate) missing.push("kurs");
    } else {
      // Domestic faktur keluaran needs the buyer's NPWP (lawan transaksi).
      if (!has(inv.buyerNpwp)) missing.push("npwp_pembeli");
    }

    if (missing.length > 0) {
      problems.push({ invoiceNo: inv.invoiceNo, missing });
      continue;
    }

    const { masa, tahun } = masaTahun(inv.date);
    const rate = exportSale ? inv.rate! : 1;
    const dppIdr = money(inv.dpp * rate);
    const ppnIdr = money(inv.taxAmount * rate);

    rows.push({
      masa_pajak: masa,
      tahun_pajak: tahun,
      jenis: exportSale ? "ekspor" : "lokal",
      npwp_penjual: (seller.npwp ?? "").trim(),
      nama_penjual: (seller.name ?? "").trim(),
      nomor_dokumen: inv.invoiceNo,
      tanggal_dokumen: isoDate(inv.date),
      npwp_pembeli: (inv.buyerNpwp ?? "").trim(),
      nama_pembeli: (inv.buyerName ?? "").trim(),
      alamat_pembeli: (inv.buyerAddress ?? "").trim(),
      mata_uang: (inv.currency || "IDR").toUpperCase(),
      dpp: money(inv.dpp),
      ppn: money(inv.taxAmount),
      tarif_ppn: inv.taxRate != null ? money(inv.taxRate) : "",
      kurs: exportSale ? String(inv.rate) : "1",
      dpp_idr: dppIdr,
      ppn_idr: ppnIdr,
      nomor_peb: (inv.pebNumber ?? "").trim(),
      tanggal_peb: isoDate(inv.pebDate),
      keterangan: (inv.exportNote ?? "").trim(),
    });
  }

  return { columns: EFAKTUR_COLUMNS, rows, problems };
}

/**
 * RFC 4180 CSV cell escaping. A field is quoted when it contains the delimiter, a
 * double-quote, or a line break; embedded quotes are doubled. Unicode passes
 * through untouched (JS strings are UTF-16; the route writes UTF-8 + BOM).
 */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize built rows to a CSV string (header + rows), CRLF line endings, comma
 * delimiter — the Windows/Excel-friendly form DJP tooling expects. The header row
 * comes from `EFAKTUR_COLUMNS`, so it always matches the cells.
 */
export function efakturToCsv(rows: EfakturRow[]): string {
  const header = EFAKTUR_COLUMNS.map((c) => csvEscape(c.header)).join(",");
  const body = rows.map((row) =>
    EFAKTUR_COLUMNS.map((c) => csvEscape(row[c.key] ?? "")).join(",")
  );
  return [header, ...body].join("\r\n");
}
