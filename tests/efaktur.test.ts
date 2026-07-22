/**
 * e-Faktur / CTAS export — the pure column builder (issue #17).
 *
 * Covers the whole documented mapping in `@/lib/efaktur`, with no Prisma:
 *   • correct columns for a DOMESTIC taxable (lokal) faktur keluaran;
 *   • correct columns for a 0% EXPORT invoice carrying a PEB, including the IDR
 *     base derived at the document rate;
 *   • CSV escaping of commas / quotes / newlines / unicode;
 *   • an invoice missing a required field is FLAGGED (surfaced), not blanked —
 *     for the buyer NPWP (lokal), the PEB number (ekspor), and the rate (foreign);
 *   • a missing seller NPWP blocks every row;
 *   • period filtering excludes out-of-range invoices.
 */
import { describe, expect, it } from "vitest";
import {
  EFAKTUR_COLUMNS,
  buildEfaktur,
  efakturToCsv,
  csvEscape,
  withinPeriod,
  type EfakturInvoiceInput,
  type EfakturSeller,
} from "@/lib/efaktur";

const SELLER: EfakturSeller = { npwp: "01.234.567.8-901.000", name: "PT Subur Anugerah Indonesia" };

/** A complete domestic taxable invoice (lokal faktur keluaran). */
function domestic(overrides: Partial<EfakturInvoiceInput> = {}): EfakturInvoiceInput {
  return {
    invoiceNo: "SI.2026.07.00001",
    date: "2026-07-15",
    currency: "IDR",
    rate: null,
    dpp: 10_000_000,
    taxAmount: 1_100_000,
    taxRate: 11,
    buyerName: "PT Pembeli Lokal",
    buyerNpwp: "09.876.543.2-109.000",
    buyerAddress: "Jl. Merdeka 1, Jakarta",
    pebNumber: null,
    pebDate: null,
    exportNote: null,
    ...overrides,
  };
}

/** A complete 0% export invoice carrying a PEB. */
function exportInv(overrides: Partial<EfakturInvoiceInput> = {}): EfakturInvoiceInput {
  return {
    invoiceNo: "SI.2026.07.00009",
    date: "2026-07-20",
    currency: "USD",
    rate: 16_000,
    dpp: 50_000,
    taxAmount: 0,
    taxRate: 0,
    buyerName: "Global Coffee Ltd",
    buyerNpwp: null,
    buyerAddress: "Hamburg, Germany",
    pebNumber: "000123-2026",
    pebDate: "2026-07-18",
    exportNote: "BL: MAEU-77213",
    ...overrides,
  };
}

describe("buildEfaktur — domestic taxable (lokal)", () => {
  it("emits one lokal row with the standard columns", () => {
    const { rows, problems } = buildEfaktur(SELLER, [domestic()]);
    expect(problems).toHaveLength(0);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.masa_pajak).toBe("07");
    expect(r.tahun_pajak).toBe("2026");
    expect(r.jenis).toBe("lokal");
    expect(r.npwp_penjual).toBe("01.234.567.8-901.000");
    expect(r.nama_penjual).toBe("PT Subur Anugerah Indonesia");
    expect(r.nomor_dokumen).toBe("SI.2026.07.00001");
    expect(r.tanggal_dokumen).toBe("2026-07-15");
    expect(r.npwp_pembeli).toBe("09.876.543.2-109.000");
    expect(r.nama_pembeli).toBe("PT Pembeli Lokal");
    expect(r.mata_uang).toBe("IDR");
    expect(r.dpp).toBe("10000000.00");
    expect(r.ppn).toBe("1100000.00");
    expect(r.tarif_ppn).toBe("11.00");
    // Domestic: rate 1, so IDR base equals the document amounts.
    expect(r.kurs).toBe("1");
    expect(r.dpp_idr).toBe("10000000.00");
    expect(r.ppn_idr).toBe("1100000.00");
    expect(r.nomor_peb).toBe("");
  });

  it("flags a domestic invoice with no buyer NPWP instead of blanking it", () => {
    const { rows, problems } = buildEfaktur(SELLER, [domestic({ buyerNpwp: null })]);
    expect(rows).toHaveLength(0);
    expect(problems).toEqual([{ invoiceNo: "SI.2026.07.00001", missing: ["npwp_pembeli"] }]);
  });
});

describe("buildEfaktur — 0% export with PEB (ekspor)", () => {
  it("emits an ekspor row with PEB and IDR base at the document rate", () => {
    const { rows, problems } = buildEfaktur(SELLER, [exportInv()]);
    expect(problems).toHaveLength(0);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.jenis).toBe("ekspor");
    expect(r.mata_uang).toBe("USD");
    expect(r.dpp).toBe("50000.00");
    expect(r.ppn).toBe("0.00");
    expect(r.npwp_pembeli).toBe(""); // a foreign buyer has no Indonesian NPWP
    expect(r.nomor_peb).toBe("000123-2026");
    expect(r.tanggal_peb).toBe("2026-07-18");
    expect(r.keterangan).toBe("BL: MAEU-77213");
    expect(r.kurs).toBe("16000");
    // IDR base = amount × rate; PPN 0 stays 0.
    expect(r.dpp_idr).toBe("800000000.00"); // 50.000 × 16.000
    expect(r.ppn_idr).toBe("0.00");
  });

  it("flags an export invoice missing its PEB number", () => {
    const { rows, problems } = buildEfaktur(SELLER, [exportInv({ pebNumber: null })]);
    expect(rows).toHaveLength(0);
    expect(problems).toEqual([{ invoiceNo: "SI.2026.07.00009", missing: ["nomor_peb"] }]);
  });

  it("flags a foreign invoice with no rate — no honest IDR value, never 1:1", () => {
    const { rows, problems } = buildEfaktur(SELLER, [exportInv({ rate: null })]);
    expect(rows).toHaveLength(0);
    expect(problems).toEqual([{ invoiceNo: "SI.2026.07.00009", missing: ["kurs"] }]);
  });

  it("reports both missing PEB and missing rate together", () => {
    const { problems } = buildEfaktur(SELLER, [exportInv({ pebNumber: null, rate: null })]);
    expect(problems[0].missing).toEqual(["nomor_peb", "kurs"]);
  });
});

describe("buildEfaktur — seller NPWP is required for every row", () => {
  it("blocks all rows and flags each invoice when the seller NPWP is missing", () => {
    const seller: EfakturSeller = { npwp: null, name: "PT Tanpa NPWP" };
    const { rows, problems } = buildEfaktur(seller, [domestic(), exportInv()]);
    expect(rows).toHaveLength(0);
    expect(problems).toHaveLength(2);
    expect(problems[0].missing).toContain("npwp_penjual");
    expect(problems[1].missing).toContain("npwp_penjual");
  });
});

describe("withinPeriod / buildEfaktur — period filtering", () => {
  it("includes the boundary days and excludes outside, at day granularity", () => {
    expect(withinPeriod("2026-07-01", { from: "2026-07-01", to: "2026-07-31" })).toBe(true);
    expect(withinPeriod("2026-07-31T23:00:00Z", { from: "2026-07-01", to: "2026-07-31" })).toBe(true);
    expect(withinPeriod("2026-06-30", { from: "2026-07-01", to: "2026-07-31" })).toBe(false);
    expect(withinPeriod("2026-08-01", { from: "2026-07-01", to: "2026-07-31" })).toBe(false);
  });

  it("silently excludes out-of-period invoices (not a problem)", () => {
    const inPeriod = domestic({ invoiceNo: "IN", date: "2026-07-10" });
    const outPeriod = domestic({ invoiceNo: "OUT", date: "2026-08-10" });
    const { rows, problems } = buildEfaktur(SELLER, [inPeriod, outPeriod], {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(rows.map((r) => r.nomor_dokumen)).toEqual(["IN"]);
    expect(problems).toHaveLength(0);
  });
});

describe("csvEscape + efakturToCsv — RFC 4180 escaping", () => {
  it("quotes fields with comma, quote or newline; doubles inner quotes", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("preserves unicode and escapes tricky buyer names in a full CSV", () => {
    const tricky = domestic({
      buyerName: 'PT "Kopi", Café Nüsantara\nDivisi Ekspor',
      buyerNpwp: "01.111.111.1-111.000",
    });
    const { rows } = buildEfaktur(SELLER, [tricky]);
    const csv = efakturToCsv(rows);
    const [header, ...lines] = csv.split("\r\n");
    // Header matches the documented column order.
    expect(header).toBe(EFAKTUR_COLUMNS.map((c) => c.header).join(","));
    // The tricky name is quoted, inner quotes doubled, unicode intact, and the
    // embedded newline does NOT split the logical record's field content.
    expect(csv).toContain('"PT ""Kopi"", Café Nüsantara\nDivisi Ekspor"');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("writes a header even with no rows", () => {
    expect(efakturToCsv([])).toBe(EFAKTUR_COLUMNS.map((c) => c.header).join(","));
  });
});
