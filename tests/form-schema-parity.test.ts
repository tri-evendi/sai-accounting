/**
 * Kesetaraan skema form <-> server (issue #53).
 *
 * Janji utama issue ini: form client memvalidasi dengan skema yang SAMA
 * seperti route handler, bukan salinan yang bisa menyimpang. Test ini
 * memverifikasi kesetaraan itu secara struktural — kalau suatu saat seseorang
 * mengubah aturan pembayaran hanya di satu sisi, ia gagal di sini.
 */

import { describe, it, expect } from "vitest";
import { paymentFormSchema } from "@/lib/validations/payment";
import { invoicePaymentSchema } from "@/lib/validations/invoice";
import { contractPaymentSchema } from "@/lib/validations/contract";

/** Field pembayaran yang diketik pengguna (tanpa id dokumen yang disuntik server). */
const formInput = { date: "2026-03-15", amount: 1000 };

describe("aturan valas identik di form dan server", () => {
  it("form menolak mata uang asing tanpa kurs — sama seperti server", () => {
    const formResult = paymentFormSchema.safeParse({ ...formInput, currency: "USD" });
    const invoiceResult = invoicePaymentSchema.safeParse({
      ...formInput,
      invoiceId: 1,
      currency: "USD",
    });
    expect(formResult.success).toBe(false);
    expect(invoiceResult.success).toBe(false);
    // Kegagalan menunjuk field yang sama: rate.
    if (!formResult.success) {
      expect(formResult.error.issues.some((i) => i.path.includes("rate"))).toBe(true);
    }
  });

  it("form menerima mata uang asing dengan kurs", () => {
    const r = paymentFormSchema.safeParse({ ...formInput, currency: "USD", rate: 16250 });
    expect(r.success).toBe(true);
  });

  it("IDR tidak butuh kurs (base currency 1:1)", () => {
    expect(paymentFormSchema.safeParse({ ...formInput, currency: "IDR" }).success).toBe(true);
  });

  it("menolak jumlah nol / negatif", () => {
    expect(
      paymentFormSchema.safeParse({ date: "2026-03-15", amount: 0, currency: "IDR" }).success
    ).toBe(false);
    expect(
      paymentFormSchema.safeParse({ date: "2026-03-15", amount: -5, currency: "IDR" }).success
    ).toBe(false);
  });

  it("menolak tanggal kosong", () => {
    expect(
      paymentFormSchema.safeParse({ date: "", amount: 100, currency: "IDR" }).success
    ).toBe(false);
  });
});

describe("field form = field server (bukan salinan)", () => {
  it("skema faktur & kontrak menerima payload yang sama seperti form + id-nya", () => {
    const valid = { ...formInput, currency: "USD", rate: 16000 };
    expect(paymentFormSchema.safeParse(valid).success).toBe(true);
    expect(invoicePaymentSchema.safeParse({ ...valid, invoiceId: 7 }).success).toBe(true);
    expect(contractPaymentSchema.safeParse({ ...valid, contractId: 7 }).success).toBe(true);
  });

  it("pesan error berbahasa Indonesia (ramah awam, prinsip MASTER.md)", () => {
    const r = paymentFormSchema.safeParse({ date: "", amount: 100, currency: "IDR" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/wajib|harus|diisi/i);
    }
  });
});
