/**
 * BERKAS IMPOR CORETAX — pembangun murni `@sai/core/coretax-xml`.
 *
 * Golden file (`tests/golden/coretax-faktur-keluaran.xml`) dibandingkan BYTE
 * DEMI BYTE: urutan elemen, salah eja resmi `BuyerAdress`, dan format angka
 * adalah hal yang gagalnya baru terlihat saat berkas ditolak Coretax. Data
 * fikstur SINTETIS — tidak ada NPWP sungguhan.
 *
 * Bila bentuk berkas sengaja berubah: `UPDATE_GOLDEN=1 bun run test
 * tests/coretax-xml.test.ts`, lalu baca diff golden-nya sebelum commit.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCoretax,
  centsToDecimal,
  coretaxToXml,
  coretaxTrxCode,
  coretaxUnit,
  nitku22,
  npwp16,
  xmlEscape,
  type CoretaxInvoiceInput,
  type CoretaxSeller,
} from "@sai/core/coretax-xml";

const GOLDEN = join(__dirname, "golden", "coretax-faktur-keluaran.xml");

const SELLER: CoretaxSeller = { npwp: "0012345678901000", nitku: null, isPkp: true };

function invoice(over: Partial<CoretaxInvoiceInput> = {}): CoretaxInvoiceInput {
  return {
    invoiceNo: "SI.2026.10.00001",
    date: "2026-10-05",
    currency: "IDR",
    pebNumber: null,
    dpp: 12_000_000,
    taxAmount: 1_320_000,
    taxRate: 11,
    buyer: {
      name: "PT Pembeli Contoh",
      address: "Jl. Contoh No. 1, Jakarta",
      email: "pajak@pembeli.test",
      npwp: "09.876.543.2-109.000",
      nik: null,
      nitku: null,
      trxCode: null,
    },
    lines: [{ name: "Lada Hitam", unit: "kg", quantity: 100, price: 120_000 }],
    ...over,
  };
}

describe("identitas pajak", () => {
  it("NPWP 15 digit menjadi 16 digit berawalan 0; tanda baca dibuang", () => {
    expect(npwp16("09.876.543.2-109.000")).toBe("0098765432109000");
    expect(npwp16("3174061502560010")).toBe("3174061502560010");
    expect(npwp16("12345")).toBeNull();
    expect(npwp16(null)).toBeNull();
  });

  it("NITKU kosong = kantor pusat (NPWP + 000000); yang diisi wajib 22 digit", () => {
    expect(nitku22(null, "0012345678901000")).toBe("0012345678901000000000");
    expect(nitku22("0012345678901000000001", "0012345678901000")).toBe("0012345678901000000001");
    expect(nitku22("123", "0012345678901000")).toBeNull();
  });
});

describe("kode transaksi & DPP Nilai Lain (PMK 131/2024)", () => {
  it("efektif 11% → 04 dengan DPP 11/12; 12% → 01 penuh; pemungut → 02/03", () => {
    expect(coretaxTrxCode(11, null)).toEqual({ code: "04", dppLain: true });
    expect(coretaxTrxCode(12, null)).toEqual({ code: "01", dppLain: false });
    expect(coretaxTrxCode(11, "02")).toEqual({ code: "02", dppLain: true });
    expect(coretaxTrxCode(11, "03")).toEqual({ code: "03", dppLain: true });
  });

  it("tarif yang tidak bisa ditulis tanpa menebak → null", () => {
    expect(coretaxTrxCode(0, null)).toBeNull();
    expect(coretaxTrxCode(null, null)).toBeNull();
    expect(coretaxTrxCode(10, null)).toBeNull();
  });

  it("angka sampel DJP: DPP 120 jt → DPP Nilai Lain 110 jt → PPN 13,2 jt", () => {
    const r = buildCoretax(SELLER, [
      invoice({
        dpp: 120_000_000,
        taxAmount: 13_200_000,
        lines: [{ name: "Barang ABC", unit: "kg", quantity: 10, price: 12_000_000 }],
      }),
    ]);
    const l = r.invoices[0]!.lines[0]!;
    expect(l.taxBaseCents).toBe(12_000_000_000);
    expect(l.otherTaxBaseCents).toBe(11_000_000_000);
    expect(l.vatRate).toBe(12);
    expect(l.vatCents).toBe(1_320_000_000);
    expect(r.warnings).toEqual([]);
  });
});

describe("satuan", () => {
  it("sinonim umum dipetakan; kode UM yang sah diterima apa adanya", () => {
    expect(coretaxUnit("Kg")).toBe("UM.0003");
    expect(coretaxUnit("pcs")).toBe("UM.0021");
    expect(coretaxUnit("UM.0037")).toBe("UM.0037");
    expect(coretaxUnit("UM.9999")).toBeNull();
    expect(coretaxUnit("karung")).toBeNull();
  });

  it("satuan tak dikenal → Lainnya + PERINGATAN, bukan masalah", () => {
    const r = buildCoretax(SELLER, [
      invoice({ lines: [{ name: "Cengkeh", unit: "karung", quantity: 100, price: 120_000 }] }),
    ]);
    expect(r.invoices[0]!.lines[0]!.unit).toBe("UM.0033");
    expect(r.warnings).toEqual([{ invoiceNo: "SI.2026.10.00001", codes: ["unit_other"] }]);
  });
});

describe("validasi: masalah DITAHAN, tidak dipancarkan kosong", () => {
  it("NPWP penjual kosong menahan SEMUA faktur", () => {
    const r = buildCoretax({ ...SELLER, npwp: null }, [invoice(), invoice({ invoiceNo: "B" })]);
    expect(r.invoices).toEqual([]);
    expect(r.problems.map((p) => p.codes)).toEqual([["seller_npwp"], ["seller_npwp"]]);
  });

  it("penjual non-PKP tidak membuat faktur pajak", () => {
    const r = buildCoretax({ ...SELLER, isPkp: false }, [invoice()]);
    expect(r.problems[0]!.codes).toContain("seller_not_pkp");
  });

  it("pembeli tanpa NPWP dan tanpa NIK", () => {
    const r = buildCoretax(SELLER, [invoice({ buyer: { ...invoice().buyer, npwp: null } })]);
    expect(r.problems).toEqual([{ invoiceNo: "SI.2026.10.00001", codes: ["buyer_id"] }]);
  });

  it("pembeli ber-NIK wajib beralamat; dokumennya National ID", () => {
    const base = invoice().buyer;
    const r = buildCoretax(SELLER, [
      invoice({ buyer: { ...base, npwp: null, nik: "3174061502560010", address: null } }),
      invoice({ invoiceNo: "B", buyer: { ...base, npwp: null, nik: "3174061502560010" } }),
    ]);
    expect(r.problems).toEqual([{ invoiceNo: "SI.2026.10.00001", codes: ["buyer_address"] }]);
    expect(r.invoices[0]).toMatchObject({
      buyerTin: "0000000000000000",
      buyerDocument: "National ID",
      buyerDocumentNumber: "3174061502560010",
      buyerIdtku: "000000",
    });
  });

  it("faktur sebelum Coretax (2025) dan tarif 0% lokal ditahan", () => {
    const r = buildCoretax(SELLER, [invoice({ date: "2024-12-31" }), invoice({ invoiceNo: "B", taxRate: 0 })]);
    expect(r.problems.map((p) => p.codes)).toEqual([["before_coretax"], ["rate_unsupported"]]);
  });

  it("faktur tanpa baris, atau baris berkuantitas nol", () => {
    const r = buildCoretax(SELLER, [
      invoice({ lines: [] }),
      invoice({ invoiceNo: "B", lines: [{ name: "x", unit: "kg", quantity: 0, price: 1 }] }),
    ]);
    expect(r.problems.map((p) => p.codes)).toEqual([["no_lines"], ["line_quantity"]]);
  });

  it("faktur ekspor (valas atau ber-PEB) disebut di `exports`, bukan di berkas", () => {
    const r = buildCoretax(SELLER, [
      invoice({ invoiceNo: "EX1", currency: "USD", pebNumber: "000123" }),
      invoice({ invoiceNo: "EX2", pebNumber: "000124" }),
    ]);
    expect(r.invoices).toEqual([]);
    expect(r.problems).toEqual([]);
    expect(r.exports).toEqual([
      { invoiceNo: "EX1", pebNumber: "000123" },
      { invoiceNo: "EX2", pebNumber: "000124" },
    ]);
  });

  it("selisih PPN per-baris vs per-faktur menjadi peringatan", () => {
    const r = buildCoretax(SELLER, [invoice({ taxAmount: 1_320_001 })]);
    expect(r.warnings[0]!.codes).toEqual(["vat_rounding"]);
  });
});

describe("serialisasi", () => {
  it("angka: titik desimal, maksimal 2 angka, bulat tanpa desimal", () => {
    expect(centsToDecimal(1_500_000)).toBe("15000");
    expect(centsToDecimal(1_500_050)).toBe("15000.5");
    expect(centsToDecimal(1_500_005)).toBe("15000.05");
    expect(centsToDecimal(0)).toBe("0");
  });

  it("teks di-escape dan karakter kendali dibuang", () => {
    expect(xmlEscape(`A & B <"C"> 'D'\u0007`)).toBe("A &amp; B &lt;&quot;C&quot;&gt; &apos;D&apos;");
  });

  it("berkas sama byte demi byte dengan golden file", () => {
    const r = buildCoretax(SELLER, [
      invoice(),
      invoice({
        invoiceNo: "SI.2026.10.00002",
        date: "2026-10-20",
        dpp: 2_500_500,
        taxAmount: 300_060,
        taxRate: 12,
        buyer: {
          name: "Toko Rempah & Sahabat",
          address: "Jl. Pasar <Baru> 7",
          email: null,
          npwp: null,
          nik: "3174061502560010",
          nitku: null,
          trxCode: null,
        },
        lines: [
          { name: "Pala Bubuk", unit: "gram", quantity: 500, price: 4_000.5 },
          { name: "Kayu Manis", unit: "karton", quantity: 1.5, price: 333_333 },
        ],
      }),
      invoice({
        invoiceNo: "SI.2026.10.00003",
        buyer: { ...invoice().buyer, name: "Dinas Contoh", trxCode: "02", nitku: "0098765432109000000123" },
      }),
    ]);
    expect(r.problems).toEqual([]);
    const xml = coretaxToXml(r.sellerTin!, r.invoices);
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, xml);
    expect(xml).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("elemen tiap TaxInvoice dalam URUTAN sampel DJP", () => {
    const xml = readFileSync(GOLDEN, "utf8");
    const first = xml.slice(xml.indexOf("<TaxInvoice>"), xml.indexOf("</TaxInvoice>"));
    const names = [...first.matchAll(/<([A-Za-z]+)[ />]/g)].map((m) => m[1]);
    expect(names.slice(0, 19)).toEqual([
      "TaxInvoice", "TaxInvoiceDate", "TaxInvoiceOpt", "TrxCode", "AddInfo", "CustomDoc",
      "CustomDocMonthYear", "RefDesc", "FacilityStamp", "SellerIDTKU", "BuyerTin",
      "BuyerDocument", "BuyerCountry", "BuyerDocumentNumber", "BuyerName", "BuyerAdress",
      "BuyerEmail", "BuyerIDTKU", "ListOfGoodService",
    ]);
    expect(names.slice(19)).toEqual([
      "GoodService", "Opt", "Code", "Name", "Unit", "Price", "Qty", "TotalDiscount",
      "TaxBase", "OtherTaxBase", "VATRate", "VAT", "STLGRate", "STLG",
    ]);
  });
});
