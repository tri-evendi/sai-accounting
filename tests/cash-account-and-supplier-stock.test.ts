/**
 * Dua kolom baru, dan aturan yang membuat keduanya aman (migrasi 0058 & 0059).
 *
 * ── Kas/bank pada pelunasan (0059) ─────────────────────────────────────────
 * Slot pemetaan `cash_kas_besar`/`cash_kas_kecil` sengaja TIDAK punya baris per
 * mata uang, dan `resolveAccountIds` jatuh ke baris agnostik bila tak ada yang
 * cocok. Membiarkan pembayaran USD memilih "kas besar" karena itu akan
 * MENGKREDIT akun kas rupiah dengan nominal dolar — bukan galat, bukan
 * penolakan, hanya angka yang salah tempat. Itu persis cacat warisan yang
 * catatan panjang di `posting/mapping.ts` peringatkan; berkas ini menguji pintu
 * yang menutupnya.
 *
 * Yang sama pentingnya: NULL harus tetap berarti "seperti sebelumnya".
 *
 * ── Pemasok pada kartu stok (0058) ─────────────────────────────────────────
 * Hanya arah MASUK yang punya pengirim.
 */
import { describe, expect, it } from "vitest";
import { paymentFormSchema } from "@/lib/validations/payment";
import { stockUpdateSchema } from "@/lib/validations/inventory";
import { cashKeyForType, MAPPING_KEYS } from "@/lib/posting/mapping";

const basePayment = { date: "2026-08-27", amount: 1_000_000 };

describe("cashKeyForType — NULL adalah perilaku lama", () => {
  it("memulangkan cash_default untuk yang tidak disebut", () => {
    // Inilah yang membuat migrasi 0059 tidak mengubah satu pun jurnal lama:
    // setiap baris yang ada masuk sebagai NULL dan tetap memposting ke slot
    // yang sama seperti sebelum kolomnya ada.
    expect(cashKeyForType(null)).toBe(MAPPING_KEYS.CASH_DEFAULT);
    expect(cashKeyForType(undefined)).toBe(MAPPING_KEYS.CASH_DEFAULT);
    expect(cashKeyForType("")).toBe(MAPPING_KEYS.CASH_DEFAULT);
  });

  it("memetakan ketiga pilihan ke slotnya sendiri", () => {
    expect(cashKeyForType("bank")).toBe(MAPPING_KEYS.CASH_BANK);
    expect(cashKeyForType("kas_besar")).toBe(MAPPING_KEYS.CASH_KAS_BESAR);
    expect(cashKeyForType("kas_kecil")).toBe(MAPPING_KEYS.CASH_KAS_KECIL);
  });
});

describe("paymentFormSchema — kas fisik hanya rupiah", () => {
  it("menerima kas besar pada pembayaran rupiah", () => {
    const r = paymentFormSchema.safeParse({
      ...basePayment,
      currency: "IDR",
      cashType: "kas_besar",
    });
    expect(r.success).toBe(true);
  });

  it("MENOLAK kas besar pada pembayaran valas", () => {
    for (const currency of ["USD", "CNY"]) {
      const r = paymentFormSchema.safeParse({
        ...basePayment,
        currency,
        rate: 16_000,
        cashType: "kas_besar",
      });
      expect(r.success, currency).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("cashType"))).toBe(true);
      }
    }
  });

  it("MENOLAK kas kecil pada pembayaran valas", () => {
    const r = paymentFormSchema.safeParse({
      ...basePayment,
      currency: "USD",
      rate: 16_000,
      cashType: "kas_kecil",
    });
    expect(r.success).toBe(false);
  });

  it("menerima bank untuk mata uang apa pun — slot itu memang punya baris per mata uang", () => {
    for (const [currency, rate] of [["IDR", undefined], ["USD", 16_000], ["CNY", 2_200]] as const) {
      const r = paymentFormSchema.safeParse({ ...basePayment, currency, rate, cashType: "bank" });
      expect(r.success, currency).toBe(true);
    }
  });

  it("memperlakukan pemilih kosong sebagai tidak disebut", () => {
    for (const value of ["", null, undefined]) {
      const r = paymentFormSchema.safeParse({ ...basePayment, currency: "USD", rate: 16_000, cashType: value });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cashType).toBeNull();
    }
  });

  it("tetap menuntut kurs untuk valas — penjaga lama tidak dilonggarkan", () => {
    const r = paymentFormSchema.safeParse({ ...basePayment, currency: "USD", cashType: "bank" });
    expect(r.success).toBe(false);
  });
});

describe("stockUpdateSchema — pemasok hanya pada barang masuk", () => {
  const base = { itemId: 3, quantity: 100, date: "2026-08-27" };

  it("menerima pemasok pada gerakan masuk", () => {
    const r = stockUpdateSchema.safeParse({ ...base, type: "in", unitCost: 5_000, supplierId: 7 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.supplierId).toBe(7);
  });

  it("MENOLAK pemasok pada gerakan keluar — tidak ada pengirim di sana", () => {
    const r = stockUpdateSchema.safeParse({ ...base, type: "out", supplierId: 7 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("supplierId"))).toBe(true);
    }
  });

  it("MENOLAK pemasok pada susut proses", () => {
    const r = stockUpdateSchema.safeParse({
      ...base,
      type: "shrinkage",
      shrinkageValue: 1_000_000,
      supplierId: 7,
    });
    expect(r.success).toBe(false);
  });

  it("barang masuk TANPA pemasok tetap sah — koreksi hitung tidak punya pengirim", () => {
    const r = stockUpdateSchema.safeParse({ ...base, type: "in", unitCost: 5_000 });
    expect(r.success).toBe(true);
  });

  it("tetap menuntut harga pokok pada barang masuk — penjaga lama utuh", () => {
    const r = stockUpdateSchema.safeParse({ ...base, type: "in", supplierId: 7 });
    expect(r.success).toBe(false);
  });
});
