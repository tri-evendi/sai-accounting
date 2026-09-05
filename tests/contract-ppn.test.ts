/**
 * PPN yang disepakati DI KONTRAK (migrasi 0062).
 *
 * ══ Kenapa kolomnya bernilai TIGA, bukan dua ═══════════════════════════════
 * Sampai sekarang PPN baru muncul di faktur, dan bawaannya disimpulkan dari dua
 * hal yang keduanya bukan isi kontrak: mata uang dokumen dan tanda bebas-PPN
 * pelanggannya. Untuk penjualan rupiah kepada pelanggan biasa, kesimpulannya
 * SELALU "kena PPN" — padahal kontrak rupiah yang disepakati tanpa PPN memang
 * ada.
 *
 * Sebuah boolean dua-nilai tidak bisa memperbaikinya, dan kegagalannya di dua
 * arah sekaligus: `false` yang merangkap "Non-PPN" dan "belum disebut" akan
 * membuat 600+ kontrak warisan seketika berbunyi "Non-PPN", DAN membuat kontrak
 * yang memang Non-PPN tak pernah bisa mematikan bawaan 11% pada fakturnya —
 * sebab jawabannya tak terbedakan dari diam. Karena itu NULL adalah keadaan
 * tersendiri, dan berkas ini menjaga ketiganya tetap terbedakan sepanjang jalan
 * dari `<select>` sampai kolomnya.
 *
 * ══ Yang SENGAJA tidak diuji di sini ═══════════════════════════════════════
 * Jurnal kontrak, karena ia memang tidak berubah: `buildContractEntry` tetap
 * membukukan D: Piutang / K: Penjualan tanpa baris PPN. PPN Keluaran terbit di
 * FAKTUR, dan memungutnya di dua tempat akan mengkredit hutang pajak dua kali
 * untuk satu penjualan yang sama.
 */
import { describe, expect, it } from "vitest";

import { contractSchema } from "@/lib/validations/contract";
import { companyTaxIdentitySchema } from "@/lib/validations/setup";
import { bomSchema, workCenterSchema } from "@/lib/validations/manufacturing";

const base = {
  contractNo: "SC-2026-001",
  date: "2026-09-05",
  buyer: "PT Pembeli",
  currency: "IDR",
  items: [{ itemName: "NUTMEG ABC", bags: 100, kgPerBag: 50, pricePerKg: 60_000 }],
};

function parse(extra: Record<string, unknown>) {
  const r = contractSchema.safeParse({ ...base, ...extra });
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data;
}

describe("contractSchema.taxable — tiga keadaan, bukan dua", () => {
  it('"true" dari <select> menjadi TRUE', () => {
    expect(parse({ taxable: "true" }).taxable).toBe(true);
  });

  it('"false" menjadi FALSE — bukan true', () => {
    /*
     * Inilah sebab skemanya memakai `preprocess`, bukan `z.coerce.boolean()`:
     * `Boolean("false")` bernilai TRUE, dan sebuah `<select>` hanya bisa
     * mengirim string. Dengan coerce, setiap kontrak yang ditandai Non-PPN
     * akan tersimpan sebagai kontrak ber-PPN — tanpa satu pun galat, dan tanpa
     * satu pun cara melihatnya kecuali dari faktur yang salah memungut.
     */
    expect(parse({ taxable: "false" }).taxable).toBe(false);
  });

  it("boolean asli (pemanggil API, bukan formulir) diterima apa adanya", () => {
    expect(parse({ taxable: true }).taxable).toBe(true);
    expect(parse({ taxable: false }).taxable).toBe(false);
  });

  it('kosong / tak disebut menjadi NULL — "belum dinyatakan", bukan "Non-PPN"', () => {
    expect(parse({ taxable: "" }).taxable).toBeNull();
    expect(parse({}).taxable).toBeNull();
    expect(parse({ taxable: null }).taxable).toBeNull();
  });

  it("kontrak lama yang disunting tanpa menyentuh PPN tetap NULL, tidak diam-diam jadi Non-PPN", () => {
    // Skema yang sama dipakai POST dan PUT. Kalau nilai yang hilang jatuh ke
    // `false`, satu perbaikan ejaan pada kontrak warisan akan menyatakan
    // "Non-PPN" atas nama orang yang tidak pernah menyatakannya.
    expect(parse({ status: "signed" }).taxable).toBeNull();
  });
});

/**
 * Jebakan yang SAMA di tiga skema lain (5 Sep 2026).
 *
 * `Boolean("false")` bernilai TRUE. Sesudah menemukannya di PPN kontrak, tiga
 * `z.coerce.boolean()` lain masih hidup di repo — `isPkp` pada penyiapan
 * perusahaan, dan `isActive` pada resep produksi & stasiun kerja. Ketiganya
 * belum pernah menerima string dari formulirnya sendiri, jadi belum ada yang
 * rusak; tetapi ketiganya juga terbuka lewat `/api/v1`, tempat muatannya
 * ditulis pemanggil yang tidak kita kendalikan.
 *
 * Akibatnya kalau dibiarkan: perusahaan yang menjawab "bukan PKP" tersimpan
 * sebagai PKP lalu memungut PPN 11% pada setiap fakturnya, dan "nonaktifkan
 * resep ini" justru mengaktifkannya. Keduanya tanpa galat.
 */
describe("booleanField — jebakan yang sama, ditutup di satu tempat", () => {
  it('identitas pajak: isPkp "false" TIDAK menjadi PKP', () => {
    const r = companyTaxIdentitySchema.safeParse({ isPkp: "false" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isPkp).toBe(false);
  });

  it("identitas pajak: tak disebut tetap jatuh ke bawaannya (PKP)", () => {
    const r = companyTaxIdentitySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isPkp).toBe(true);
  });

  it('stasiun kerja: isActive "false" benar-benar menonaktifkan', () => {
    const r = workCenterSchema.safeParse({ code: "WC-1", name: "Sortir", isActive: "false" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(false);
  });

  it('resep: isActive "0" juga dibaca sebagai tidak', () => {
    const r = bomSchema.safeParse({
      code: "BOM-1",
      outputItemId: 1,
      outputQuantity: 100,
      isActive: "0",
      components: [{ itemId: 2, quantity: 1 }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(false);
  });

  it("nilai yang TIDAK dikenal ditolak, bukan ditebak menjadi true", () => {
    // "ya", "on", "" bukan kosakata yang kita janjikan. Menebaknya berarti
    // mengembalikan bug yang sama lewat pintu yang lebih sopan.
    const r = workCenterSchema.safeParse({ code: "WC-2", name: "Sangrai", isActive: "mungkin" });
    expect(r.success).toBe(false);
  });
});
