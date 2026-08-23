/**
 * Kirim faktur ke pelanggan (issue #465) — sifat yang dikunci:
 *
 *   • normalisasi nomor WhatsApp: `0` pembuka adalah PREFIKS SAMBUNGAN, bukan
 *     bagian nomor — `620…` adalah kesalahan yang tidak pernah terlihat sebagai
 *     galat, hanya sebagai pelanggan yang tidak membalas;
 *   • yang tidak bisa dipahami DITOLAK, tidak ditebak;
 *   • satu pemetaan bahan cetak (`buildInvoicePdfData`) — supaya kertas yang
 *     DIUNDUH dan kertas yang DIKIRIM tidak bisa menyimpang;
 *   • baris warisan tanpa kolom `taxable` tetap terbaca sebagai ber-PPN.
 */
import { describe, expect, it } from "vitest";

import { normalizeWhatsAppNumber, whatsAppShareUrl } from "@/lib/phone";
import { buildInvoicePdfData, type InvoiceRowForPdf } from "@/lib/pdf/invoice-pdf-data";

describe("normalisasi nomor WhatsApp", () => {
  it("gaya penulisan Indonesia yang lazim → satu bentuk yang sama", () => {
    const expected = "6281234567890";
    for (const raw of [
      "081234567890",
      "0812-3456-7890",
      "0812 3456 7890",
      "+6281234567890",
      "+62 812-3456-7890",
      "6281234567890",
      "81234567890",
      "  081234567890  ",
    ]) {
      expect(normalizeWhatsAppNumber(raw), raw).toBe(expected);
    }
  });

  it("`0` pembuka DIBUANG, tidak ditempeli 62 — `620…` menuju entah ke mana", () => {
    expect(normalizeWhatsAppNumber("081234567890")).not.toContain("620");
    // Bentuk yang sudah rusak di sumbernya pun ditolak, bukan diteruskan.
    expect(normalizeWhatsAppNumber("+62 0812 3456 7890")).toBeNull();
  });

  it("nomor asing dengan `+` dibiarkan apa adanya — bukan dipaksa jadi Indonesia", () => {
    expect(normalizeWhatsAppNumber("+1 555 010 1234")).toBe("15550101234");
    expect(normalizeWhatsAppNumber("+60 12-345 6789")).toBe("60123456789");
  });

  it("yang tidak bisa dipahami DITOLAK, tidak ditebak", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "   ",
      "-",
      "telepon rumah", // huruf
      "0812 ext 4", // huruf di tengah angka
      "0812345/0813456", // dua nomor dalam satu sel
      "0812+34567", // `+` bukan di depan
      "12345", // terlalu pendek
      "0812345678901234567", // melewati batas E.164
      "60123456789012345", // idem, sudah berkode negara
      "12345678", // tanpa `+`, tanpa 0/62/8: kode negaranya tidak diketahui
    ]) {
      expect(normalizeWhatsAppNumber(raw as string | null), String(raw)).toBeNull();
    }
  });

  it("tautan wa.me: nomor apa adanya, teks ter-encode", () => {
    const url = whatsAppShareUrl("6281234567890", "Faktur INV/2026/08/1 & lampirannya");
    expect(url.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
    expect(url).toContain("%26"); // `&` tidak boleh memecah querystring
    expect(url).not.toContain(" ");
  });
});

/** Baris faktur minimal — bentuk yang dibaca pembangun bahan cetak. */
const row = (over: Partial<InvoiceRowForPdf> = {}): InvoiceRowForPdf => ({
  invoiceNo: "INV/2026/08/1",
  date: new Date("2026-08-23T00:00:00.000Z"),
  status: "pending",
  currency: "IDR",
  taxAmount: "1100.00",
  taxable: true,
  taxRate: "11.00",
  pebNumber: null,
  pebDate: null,
  exportNote: null,
  customer: { name: "PT Contoh" },
  items: [{ itemName: "Jasa", quantity: "2.000", price: "5000.00", unit: "unit" }],
  payments: [],
  ...over,
});

describe("bahan cetak faktur — satu pemetaan untuk unduh & kirim", () => {
  it("Decimal/Date dari Prisma diterjemahkan ke number/ISO yang dibaca renderer", () => {
    const data = buildInvoicePdfData(row());
    expect(data.taxAmount).toBe(1100);
    expect(data.taxRate).toBe(11);
    expect(data.items[0]).toEqual({ itemName: "Jasa", quantity: 2, price: 5000, unit: "unit" });
    expect(data.date).toBe("2026-08-23T00:00:00.000Z");
    expect(data.customerName).toBe("PT Contoh");
  });

  it("baris warisan: `taxable` NULL tapi `tax_amount` terisi → tetap ber-PPN", () => {
    // Yang tersimpan itulah yang benar-benar diposting (issue #16); kalau
    // dibaca sebagai tidak-ber-PPN, kertasnya kehilangan label PPN-nya.
    expect(buildInvoicePdfData(row({ taxable: null })).taxable).toBe(true);
    expect(buildInvoicePdfData(row({ taxable: null, taxAmount: "0" })).taxable).toBe(false);
  });

  it("mata uang kosong pada baris lama jatuh ke IDR, bukan string kosong", () => {
    expect(buildInvoicePdfData(row({ currency: null })).currency).toBe("IDR");
    expect(buildInvoicePdfData(row({ currency: "" })).currency).toBe("IDR");
  });

  it("tanpa pelanggan: nama NULL, bukan 'undefined' yang tercetak di kertas", () => {
    expect(buildInvoicePdfData(row({ customer: null })).customerName).toBeNull();
  });

  it("kurs & PEB dokumen ekspor ikut, tanggalnya sebagai ISO", () => {
    const data = buildInvoicePdfData(
      row({
        currency: "USD",
        taxable: false,
        taxAmount: "0",
        taxRate: null,
        pebNumber: "PEB-9",
        pebDate: new Date("2026-08-20T00:00:00.000Z"),
        exportNote: "BL-123",
      })
    );
    expect(data.currency).toBe("USD");
    expect(data.taxable).toBe(false);
    expect(data.taxRate).toBeNull();
    expect(data.pebNumber).toBe("PEB-9");
    expect(data.pebDate).toBe("2026-08-20T00:00:00.000Z");
    expect(data.exportNote).toBe("BL-123");
  });
});
