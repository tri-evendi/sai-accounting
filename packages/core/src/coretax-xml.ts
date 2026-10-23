/**
 * BERKAS IMPOR FAKTUR PAJAK KELUARAN CORETAX (XML) — pembangun MURNI.
 *
 * Sejak 1 Januari 2025 faktur pajak dibuat di Coretax DJP. Impor massalnya
 * memakai XML berakar `TaxInvoiceBulk`; bentuknya di sini disalin dari berkas
 * resmi DJP, bukan dikarang:
 *
 *   • "Sample Faktur PK Template v.1.4.xml" (dibawa juga oleh paket
 *     ConverterEfakturCoretax v1.6, 22 Juli 2025) dan templat Excel
 *     "Sample Faktur PK Template v.1.6.1.xlsx" beserta lembar REF dan
 *     "Keterangan"-nya — https://www.pajak.go.id/en/node/112031
 *   • urutan elemen, nama elemen (termasuk salah eja resmi `BuyerAdress`), dan
 *     kode rujukan (TrxCode, Opt, BuyerDocument, satuan UM.00xx) persis dari
 *     berkas-berkas itu.
 *
 * ⚠ XSD-nya (`TaxInvoice.xsd`, yang disebut atribut `noNamespaceSchemaLocation`)
 * TIDAK diterbitkan DJP. Panjang maksimum kolom dan aturan kosong/tidak kosong
 * karena itu dibaca dari sampel + lembar "Keterangan", bukan dari skema —
 * docs/EFAKTUR.md §TODO-verify mencatat apa yang belum terbukti.
 *
 * ══ YANG MASUK, YANG TIDAK ═════════════════════════════════════════════════
 *   • Faktur LOKAL (IDR) yang memungut PPN → satu `<TaxInvoice>`.
 *   • Faktur EKSPOR (valas / ber-PEB) TIDAK: PEB adalah dokumen yang
 *     dipersamakan dengan faktur pajak (PER-11/PJ/2025 Ps. 62), dan di Coretax
 *     ia ditarik sebagai "Prepopulated PEB" dari DJBC — bukan diimpor. Faktur
 *     itu dikembalikan di `exports` supaya layar bisa menyebutnya, bukan
 *     dibuang diam-diam.
 *   • Faktur yang kekurangan data wajib → `problems`, tidak pernah dipancarkan
 *     dengan kolom kosong. Berkas yang diam-diam kehilangan satu faktur lebih
 *     buruk daripada berkas yang menolak dibuat.
 *
 * ══ PPN 12% DAN DPP NILAI LAIN (PMK 131/2024) ══════════════════════════════
 * Buku ini mencatat PPN efektif per faktur (`tax_rate`, biasanya 11). Coretax
 * menuliskannya lain:
 *   • efektif 11% (barang/jasa BUKAN mewah) → kode 04 "DPP Nilai Lain",
 *     `OtherTaxBase` = 11/12 × `TaxBase`, `VATRate` 12. Sampel DJP:
 *     DPP 120.000.000 → DPP Nilai Lain 110.000.000 → PPN 13.200.000.
 *   • 12% penuh (barang mewah) → kode 01, `OtherTaxBase` = `TaxBase`.
 *   • pelanggan pemungut PPN (instansi pemerintah / BUMN) → kode 02/03 dengan
 *     DPP 11/12 yang sama — disetel per pelanggan (`customers.efaktur_trx_code`).
 * Tarif lain (0% lokal, 07/08 fasilitas) TIDAK ditebak: fasilitas butuh kode
 * keterangan tambahan & cap fasilitas yang tidak dicatat buku ini, jadi faktur
 * seperti itu menjadi `problems` dan dibuat manual di Coretax.
 *
 * Uang dihitung dalam SEN bulat, bukan float: 11/12 dari angka berdesimal di
 * float adalah sumber selisih satu sen yang tidak bisa dijelaskan siapa pun.
 *
 * MURNI: tanpa Prisma, tanpa I/O — lapisan data (`src/lib/coretax-data.ts`)
 * membaca buku dan memanggil ini; jalur Go hanya MENGANGKUT XML yang dibangun
 * di sini (09 §3.3: Go berhenti sebelum perhitungan akuntansi).
 */
import { businessISODate } from "./business-date";

// ── Kosakata resmi (lembar REF-General templat v1.6.1) ─────────────────────

/** Kode transaksi faktur keluaran yang DIBANGUN berkas ini. */
export const CORETAX_TRX_CODES = ["01", "02", "03", "04"] as const;
export type CoretaxTrxCode = (typeof CORETAX_TRX_CODES)[number];

/** Override per pelanggan: pemungut PPN. 01/04 diturunkan dari tarif. */
export const CUSTOMER_TRX_CODE_OVERRIDES = ["02", "03"] as const;
export type CustomerTrxCodeOverride = (typeof CUSTOMER_TRX_CODE_OVERRIDES)[number];

/** Satuan ukur Coretax (UM.0001–UM.0039), kode → nama resmi. */
export const CORETAX_UNITS: Readonly<Record<string, string>> = {
  "UM.0001": "Metrik Ton",
  "UM.0002": "Wet Ton",
  "UM.0003": "Kilogram",
  "UM.0004": "Gram",
  "UM.0005": "Karat",
  "UM.0006": "Kiloliter",
  "UM.0007": "Liter",
  "UM.0008": "Barrel",
  "UM.0009": "MMBTU",
  "UM.0010": "Ampere",
  "UM.0011": "Sentimeter Kubik",
  "UM.0012": "Meter Persegi",
  "UM.0013": "Meter",
  "UM.0014": "Inci",
  "UM.0015": "Sentimeter",
  "UM.0016": "Yard",
  "UM.0017": "Lusin",
  "UM.0018": "Unit",
  "UM.0019": "Set",
  "UM.0020": "Lembar",
  "UM.0021": "Piece",
  "UM.0022": "Boks",
  "UM.0023": "Tahun",
  "UM.0024": "Bulan",
  "UM.0025": "Minggu",
  "UM.0026": "Hari",
  "UM.0027": "Jam",
  "UM.0028": "Menit",
  "UM.0029": "Persen",
  "UM.0030": "Kegiatan",
  "UM.0031": "Laporan",
  "UM.0032": "Bahan",
  "UM.0033": "Lainnya",
  "UM.0034": "Meter Kubik",
  "UM.0035": "Sentimeter Persegi",
  "UM.0036": "Drum",
  "UM.0037": "Karton",
  "UM.0038": "Kwh",
  "UM.0039": "Roll",
};

/** Satuan "Lainnya" — dipakai bila satuan baris tak dikenali, dengan peringatan. */
export const CORETAX_UNIT_OTHER = "UM.0033";

/**
 * Satuan bebas di baris faktur → kode Coretax. Kuncinya huruf kecil tanpa
 * titik/spasi. Hanya sinonim yang TIDAK ambigu; sisanya jatuh ke "Lainnya"
 * dengan peringatan, bukan ditebak.
 */
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  mt: "UM.0001", ton: "UM.0001", tonne: "UM.0001", metrikton: "UM.0001",
  kg: "UM.0003", kgs: "UM.0003", kilo: "UM.0003", kilogram: "UM.0003",
  g: "UM.0004", gr: "UM.0004", gram: "UM.0004",
  l: "UM.0007", lt: "UM.0007", ltr: "UM.0007", liter: "UM.0007", litre: "UM.0007",
  m: "UM.0013", meter: "UM.0013",
  m2: "UM.0012", m3: "UM.0034", cm: "UM.0015",
  lusin: "UM.0017", dozen: "UM.0017", dz: "UM.0017",
  unit: "UM.0018", units: "UM.0018",
  set: "UM.0019", sets: "UM.0019",
  lembar: "UM.0020", lbr: "UM.0020", sheet: "UM.0020",
  pc: "UM.0021", pcs: "UM.0021", piece: "UM.0021", pieces: "UM.0021", buah: "UM.0021", bh: "UM.0021",
  box: "UM.0022", boks: "UM.0022", kotak: "UM.0022",
  drum: "UM.0036",
  karton: "UM.0037", carton: "UM.0037", ctn: "UM.0037", dus: "UM.0037",
  kwh: "UM.0038",
  roll: "UM.0039", rol: "UM.0039",
  bulan: "UM.0024", hari: "UM.0026", jam: "UM.0027",
  lainnya: "UM.0033",
};

/** Satuan baris → kode Coretax, atau `null` bila tidak dikenali. */
export function coretaxUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  const raw = unit.trim();
  if (/^UM\.\d{4}$/.test(raw)) return CORETAX_UNITS[raw] ? raw : null;
  const key = raw.toLowerCase().replace(/[.\s]/g, "");
  if (key === "") return null;
  return UNIT_ALIASES[key] ?? null;
}

// ── Identitas pajak ────────────────────────────────────────────────────────

/**
 * NPWP → 16 digit. NPWP 15 digit lama menjadi 16 digit dengan awalan `0`
 * (PMK 136/2023); tanda baca dibuang. `null` bila bukan 15/16 digit.
 */
export function npwp16(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 16) return digits;
  if (digits.length === 15) return `0${digits}`;
  return null;
}

/** NIK = tepat 16 digit. */
export function nik16(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 16 ? digits : null;
}

/**
 * NITKU (ID TKU) 22 digit. Yang diisi dipakai bila sah; kosong = kantor pusat,
 * NPWP 16 digit + `000000` (bentuk yang dipakai kedua sampel DJP).
 */
export function nitku22(explicit: string | null | undefined, npwp: string | null): string | null {
  const digits = (explicit ?? "").replace(/\D/g, "");
  if (digits.length === 22) return digits;
  if (digits.length > 0) return null;
  return npwp ? `${npwp}000000` : null;
}

// ── Masukan & keluaran ─────────────────────────────────────────────────────

export interface CoretaxSeller {
  npwp: string | null;
  nitku: string | null;
  isPkp: boolean;
}

export interface CoretaxLineInput {
  name: string;
  unit: string | null;
  quantity: number;
  price: number;
}

export interface CoretaxInvoiceInput {
  invoiceNo: string;
  date: string | Date;
  currency: string;
  /** Faktur bernomor PEB = ekspor, apa pun mata uangnya. */
  pebNumber: string | null;
  /** DPP tersimpan (#16); null pada baris lama → dihitung dari baris. */
  dpp: number | null;
  taxAmount: number;
  /** Tarif efektif dalam persen; null bila tak tercatat. */
  taxRate: number | null;
  buyer: {
    name: string | null;
    address: string | null;
    email: string | null;
    npwp: string | null;
    nik: string | null;
    nitku: string | null;
    trxCode: string | null;
  };
  lines: CoretaxLineInput[];
}

/** Kunci masalah — diterjemahkan layar (`tax.coretax.problem.<kunci>`). */
export type CoretaxProblemCode =
  | "seller_npwp"
  | "seller_nitku"
  | "seller_not_pkp"
  | "before_coretax"
  | "buyer_id"
  | "buyer_nitku"
  | "buyer_address"
  | "no_lines"
  | "line_quantity"
  | "rate_unsupported";

/** Peringatan: berkas tetap dibuat, tapi orang perlu tahu. */
export type CoretaxWarningCode = "unit_other" | "vat_rounding" | "dpp_mismatch";

export interface CoretaxIssue<C extends string> {
  invoiceNo: string;
  codes: C[];
}

export interface CoretaxGoodService {
  opt: "A" | "B";
  code: string;
  name: string;
  unit: string;
  /** Semua uang dalam SEN bulat. */
  priceCents: number;
  qty: number;
  discountCents: number;
  taxBaseCents: number;
  otherTaxBaseCents: number;
  vatRate: number;
  vatCents: number;
}

export interface CoretaxTaxInvoice {
  invoiceNo: string;
  date: string;
  trxCode: CoretaxTrxCode;
  sellerIdtku: string;
  buyerTin: string;
  buyerDocument: "TIN" | "National ID";
  buyerDocumentNumber: string;
  buyerName: string;
  buyerAddress: string;
  buyerEmail: string;
  buyerIdtku: string;
  lines: CoretaxGoodService[];
}

export interface CoretaxResult {
  sellerTin: string | null;
  invoices: CoretaxTaxInvoice[];
  problems: CoretaxIssue<CoretaxProblemCode>[];
  warnings: CoretaxIssue<CoretaxWarningCode>[];
  /** Faktur ekspor (PEB) — tidak diimpor, ditarik "Prepopulated PEB" di Coretax. */
  exports: { invoiceNo: string; pebNumber: string | null }[];
}

/** Coretax dimulai 1 Januari 2025; faktur sebelumnya milik e-Faktur lama. */
export const CORETAX_START = "2025-01-01";

/** Kode barang/jasa umum — dipakai kedua sampel DJP; kolomnya opsional. */
export const CORETAX_GENERIC_GOODS_CODE = "000000";

const cents = (n: number): number => Math.round((n + Math.sign(n) * Number.EPSILON) * 100);

/** Satu faktur sudah valid → baris-barisnya, dalam sen. */
function buildLines(
  lines: CoretaxLineInput[],
  dppLain: boolean,
  warnings: Set<CoretaxWarningCode>
): CoretaxGoodService[] {
  return lines.map((l) => {
    const unit = coretaxUnit(l.unit);
    if (!unit) warnings.add("unit_other");
    const priceCents = cents(l.price);
    const taxBaseCents = Math.round(priceCents * l.quantity);
    const otherTaxBaseCents = dppLain ? Math.round((taxBaseCents * 11) / 12) : taxBaseCents;
    return {
      opt: "A",
      code: CORETAX_GENERIC_GOODS_CODE,
      name: l.name.trim(),
      unit: unit ?? CORETAX_UNIT_OTHER,
      priceCents,
      qty: l.quantity,
      discountCents: 0,
      taxBaseCents,
      otherTaxBaseCents,
      vatRate: 12,
      vatCents: Math.round((otherTaxBaseCents * 12) / 100),
    };
  });
}

const has = (v: string | null | undefined): v is string => v != null && v.trim() !== "";

/** Apakah faktur ini ekspor (PEB) — bukan faktur keluaran Coretax? */
export function isCoretaxExport(inv: { currency: string; pebNumber: string | null }): boolean {
  return (inv.currency || "IDR").toUpperCase() !== "IDR" || has(inv.pebNumber);
}

/**
 * Kode transaksi dari tarif efektif + override pelanggan, atau `null` bila
 * tarifnya tidak bisa ditulis tanpa menebak (0%, atau angka lain).
 */
export function coretaxTrxCode(
  taxRate: number | null,
  customerOverride: string | null
): { code: CoretaxTrxCode; dppLain: boolean } | null {
  if (taxRate === 12) return { code: "01", dppLain: false };
  if (taxRate !== 11) return null;
  if (customerOverride === "02" || customerOverride === "03") {
    return { code: customerOverride, dppLain: true };
  }
  return { code: "04", dppLain: true };
}

/** Bangun isi berkas: faktur yang siap, masalah, peringatan, dan ekspor. */
export function buildCoretax(seller: CoretaxSeller, invoices: CoretaxInvoiceInput[]): CoretaxResult {
  const sellerTin = npwp16(seller.npwp);
  const sellerIdtku = nitku22(seller.nitku, sellerTin);
  const sellerCodes: CoretaxProblemCode[] = [];
  if (!sellerTin) sellerCodes.push("seller_npwp");
  else if (!sellerIdtku) sellerCodes.push("seller_nitku");
  if (!seller.isPkp) sellerCodes.push("seller_not_pkp");

  const result: CoretaxResult = { sellerTin, invoices: [], problems: [], warnings: [], exports: [] };

  for (const inv of invoices) {
    if (isCoretaxExport(inv)) {
      result.exports.push({ invoiceNo: inv.invoiceNo, pebNumber: inv.pebNumber });
      continue;
    }
    const date = businessISODate(inv.date instanceof Date ? inv.date : new Date(inv.date));
    const codes: CoretaxProblemCode[] = [...sellerCodes];
    if (date < CORETAX_START) codes.push("before_coretax");

    const trx = coretaxTrxCode(inv.taxRate, inv.buyer.trxCode);
    if (!trx) codes.push("rate_unsupported");

    const tin = npwp16(inv.buyer.npwp);
    const nik = tin ? null : nik16(inv.buyer.nik);
    const buyerIdtku = tin ? nitku22(inv.buyer.nitku, tin) : "000000";
    if (!tin && !nik) codes.push("buyer_id");
    else if (tin && !buyerIdtku) codes.push("buyer_nitku");
    // Pembeli ber-NPWP: nama & alamatnya diisi DJP dari datanya sendiri
    // (lembar "Keterangan"). Pembeli ber-NIK tidak punya data itu di DJP.
    if (!tin && nik && !has(inv.buyer.address)) codes.push("buyer_address");

    if (inv.lines.length === 0) codes.push("no_lines");
    if (inv.lines.some((l) => !(l.quantity > 0) || l.price < 0)) codes.push("line_quantity");

    if (codes.length > 0) {
      result.problems.push({ invoiceNo: inv.invoiceNo, codes: [...new Set(codes)] });
      continue;
    }

    const warn = new Set<CoretaxWarningCode>();
    const lines = buildLines(inv.lines, trx!.dppLain, warn);
    const baseSum = lines.reduce((s, l) => s + l.taxBaseCents, 0);
    const vatSum = lines.reduce((s, l) => s + l.vatCents, 0);
    if (inv.dpp != null && Math.abs(cents(inv.dpp) - baseSum) > 1) warn.add("dpp_mismatch");
    // Coretax menghitung PPN per BARIS; buku menghitungnya per FAKTUR (#16).
    // Selisih pembulatan beberapa sen wajar — tapi orang perlu tahu bahwa PPN
    // di DJP tidak persis sama dengan PPN di buku.
    if (cents(inv.taxAmount) !== vatSum) warn.add("vat_rounding");
    if (warn.size > 0) result.warnings.push({ invoiceNo: inv.invoiceNo, codes: [...warn] });

    result.invoices.push({
      invoiceNo: inv.invoiceNo,
      date,
      trxCode: trx!.code,
      sellerIdtku: sellerIdtku!,
      buyerTin: tin ?? "0000000000000000",
      buyerDocument: tin ? "TIN" : "National ID",
      buyerDocumentNumber: tin ? "-" : nik!,
      buyerName: (inv.buyer.name ?? "").trim(),
      buyerAddress: (inv.buyer.address ?? "").trim(),
      buyerEmail: (inv.buyer.email ?? "").trim(),
      buyerIdtku: buyerIdtku!,
      lines,
    });
  }
  return result;
}

// ── Serialisasi ────────────────────────────────────────────────────────────

/** Escape teks XML 1.0; karakter kendali yang tidak sah dibuang. */
export function xmlEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Sen → desimal bertitik, maksimal 2 angka di belakang koma (bulat tanpa desimal). */
export function centsToDecimal(c: number): string {
  const neg = c < 0;
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
  return neg ? `-${body}` : body;
}

/** Kuantitas → desimal bertitik tanpa nol di belakang (maks 3 desimal, presisi buku). */
function qtyToDecimal(q: number): string {
  return String(Math.round(q * 1000) / 1000);
}

const el = (indent: number, name: string, value: string): string =>
  value === "" ? `${"\t".repeat(indent)}<${name}/>` : `${"\t".repeat(indent)}<${name}>${xmlEscape(value)}</${name}>`;

/** Satu `<TaxInvoice>` — urutan elemen PERSIS sampel DJP. */
function taxInvoiceXml(inv: CoretaxTaxInvoice): string[] {
  const out = [
    "\t\t<TaxInvoice>",
    el(3, "TaxInvoiceDate", inv.date),
    el(3, "TaxInvoiceOpt", "Normal"),
    el(3, "TrxCode", inv.trxCode),
    el(3, "AddInfo", ""),
    el(3, "CustomDoc", ""),
    el(3, "CustomDocMonthYear", ""),
    el(3, "RefDesc", inv.invoiceNo),
    el(3, "FacilityStamp", ""),
    el(3, "SellerIDTKU", inv.sellerIdtku),
    el(3, "BuyerTin", inv.buyerTin),
    el(3, "BuyerDocument", inv.buyerDocument),
    // ISO alpha-3: IDN = Indonesia. Sampel XML DJP menulis `IND` (India) —
    // salah ketik di sampelnya; lembar REF-KodeNegara dan baris contoh Excel
    // memakai IDN.
    el(3, "BuyerCountry", "IDN"),
    el(3, "BuyerDocumentNumber", inv.buyerDocumentNumber),
    el(3, "BuyerName", inv.buyerName),
    el(3, "BuyerAdress", inv.buyerAddress),
    el(3, "BuyerEmail", inv.buyerEmail),
    el(3, "BuyerIDTKU", inv.buyerIdtku),
    "\t\t\t<ListOfGoodService>",
  ];
  for (const l of inv.lines) {
    out.push(
      "\t\t\t\t<GoodService>",
      el(5, "Opt", l.opt),
      el(5, "Code", l.code),
      el(5, "Name", l.name),
      el(5, "Unit", l.unit),
      el(5, "Price", centsToDecimal(l.priceCents)),
      el(5, "Qty", qtyToDecimal(l.qty)),
      el(5, "TotalDiscount", centsToDecimal(l.discountCents)),
      el(5, "TaxBase", centsToDecimal(l.taxBaseCents)),
      el(5, "OtherTaxBase", centsToDecimal(l.otherTaxBaseCents)),
      el(5, "VATRate", String(l.vatRate)),
      el(5, "VAT", centsToDecimal(l.vatCents)),
      el(5, "STLGRate", "0"),
      el(5, "STLG", "0"),
      "\t\t\t\t</GoodService>"
    );
  }
  out.push("\t\t\t</ListOfGoodService>", "\t\t</TaxInvoice>");
  return out;
}

/** Batas satu berkas impor Coretax (DDTC, konsultasi Coretax). */
export const CORETAX_MAX_INVOICES_PER_FILE = 1000;

/**
 * Serialisasikan faktur yang siap ke satu berkas `TaxInvoiceBulk`. Penjual
 * wajib ada (`sellerTin`); daftar kosong tetap berkas yang sah tapi pemanggil
 * sebaiknya tidak menawarkannya.
 */
export function coretaxToXml(sellerTin: string, invoices: CoretaxTaxInvoice[]): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8" ?>',
    '<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">',
    el(1, "TIN", sellerTin),
    "\t<ListOfTaxInvoice>",
    ...invoices.flatMap(taxInvoiceXml),
    "\t</ListOfTaxInvoice>",
    "</TaxInvoiceBulk>",
  ];
  return lines.join("\r\n") + "\r\n";
}
