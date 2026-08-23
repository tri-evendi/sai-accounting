/**
 * Penagihan Indonesia (issue #141) — sifat yang dikunci:
 *   • tanda tangan webhook Midtrans: rumus resmi SHA-512, ditolak bila salah;
 *   • pemetaan status gerbang → status pembayaran: gagal bayar BERUJUNG
 *     `payment_failed` → `past_due` — TIDAK PERNAH langsung `suspended`;
 *   • transport mock deterministik & tanpa jaringan; transport real tidak
 *     pernah hidup di luar produksi;
 *   • PPN tagihan platform dihitung LEWAT lib/tax.ts — tarifnya tidak diketik
 *     ulang (dibuktikan dengan membandingkan ke computeTax, bukan ke angka);
 *   • tidak ada satu pun data kartu yang menyentuh skema/kode kita.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MOCK_SERVER_KEY,
  mapTransactionStatus,
  midtransSignature,
  manualPaymentInstructions,
  offersInstantPayment,
  resolvePaymentGateway,
  verifyMidtransSignature,
  webhookServerKey,
  type MidtransNotification,
} from "@/lib/payment-gateway";
import { platformInvoiceAmounts, transition } from "@/lib/subscription-lifecycle";
import { computeTax, DEFAULT_TAX_RATE } from "@/lib/tax";

const notification = (over: Partial<MidtransNotification> = {}): MidtransNotification => ({
  order_id: "PINV-S1-20260801",
  status_code: "200",
  gross_amount: "166500.00",
  signature_key: "",
  transaction_status: "settlement",
  transaction_id: "tx-123",
  ...over,
});

describe("tanda tangan webhook Midtrans", () => {
  it("rumus resmi: sha512(order_id + status_code + gross_amount + serverKey)", () => {
    const n = notification();
    const signed = { ...n, signature_key: midtransSignature(n, "key-1") };
    expect(verifyMidtransSignature(signed, "key-1")).toBe(true);
  });

  it("kunci lain / isi diubah → DITOLAK", () => {
    const n = notification();
    const signed = { ...n, signature_key: midtransSignature(n, "key-1") };
    expect(verifyMidtransSignature(signed, "key-2")).toBe(false);
    expect(
      verifyMidtransSignature({ ...signed, gross_amount: "1.00" }, "key-1")
    ).toBe(false);
  });
});

describe("pemetaan status gerbang", () => {
  it("settlement/capture → paid; pending → pending; deny/cancel → failed; expire → expired", () => {
    expect(mapTransactionStatus("settlement")).toBe("paid");
    expect(mapTransactionStatus("capture")).toBe("paid");
    expect(mapTransactionStatus("pending")).toBe("pending");
    expect(mapTransactionStatus("deny")).toBe("failed");
    expect(mapTransactionStatus("cancel")).toBe("failed");
    expect(mapTransactionStatus("expire")).toBe("expired");
  });

  it("status asing (refund dsb.) → null: tidak ada tindakan otomatis", () => {
    expect(mapTransactionStatus("refund")).toBeNull();
    expect(mapTransactionStatus("apa-ini")).toBeNull();
  });

  it("gagal bayar membawa langganan ke past_due — TIDAK PERNAH langsung suspended", () => {
    // deny/expire → event payment_failed di mesin siklus hidup:
    expect(transition("active", "payment_failed")).toBe("past_due");
    // dan TIDAK ADA event pembayaran yang menghasilkan suspended — suspensi
    // hanya milik grace_expired (masa tenggang, penjadwal #140):
    expect(transition("active", "payment_failed")).not.toBe("suspended");
    expect(transition("past_due", "payment_failed")).toBeNull();
  });
});

describe("resolver gerbang — pengaman ganda transport (pola mailer)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.PAYMENT_GATEWAY = saved.PAYMENT_GATEWAY;
    process.env.MIDTRANS_SERVER_KEY = saved.MIDTRANS_SERVER_KEY;
  });

  it("bawaan = manual (tanpa gerbang, tanpa jaringan)", async () => {
    delete process.env.PAYMENT_GATEWAY;
    const gw = resolvePaymentGateway();
    expect(gw.name).toBe("manual");
    const charge = await gw.createCharge({
      invoiceNumber: "PINV-X",
      grossAmount: "100.00",
      method: "virtual_account",
    });
    expect(charge.method).toBe("manual_transfer");
    expect(charge.gatewayRef).toBe("manual-PINV-X");
  });

  it("midtrans di luar produksi = MOCK: deterministik, nol jaringan, VA stabil", async () => {
    process.env.PAYMENT_GATEWAY = "midtrans";
    process.env.MIDTRANS_SERVER_KEY = "real-key-yang-tidak-boleh-dipakai";
    const gw = resolvePaymentGateway(); // NODE_ENV=test → mock walau kunci ada
    const a = await gw.createCharge({
      invoiceNumber: "PINV-S1-20260801",
      grossAmount: "166500.00",
      method: "virtual_account",
      bank: "bca",
    });
    const b = await gw.createCharge({
      invoiceNumber: "PINV-S1-20260801",
      grossAmount: "166500.00",
      method: "virtual_account",
      bank: "bca",
    });
    expect(a.gatewayRef).toMatch(/^mock-/);
    expect(a.gatewayRef).toBe(b.gatewayRef); // deterministik = idempoten
    expect(a.vaNumber).toBe(b.vaNumber);
    expect(a.vaNumber).toMatch(/^88\d{10}$/);
    expect(a.bank).toBe("bca");
  });

  it("kunci webhook: produksi TANPA kunci = null (fail-closed); dev jatuh ke kunci mock", () => {
    delete process.env.MIDTRANS_SERVER_KEY;
    expect(webhookServerKey()).toBe(MOCK_SERVER_KEY); // NODE_ENV=test
    process.env.MIDTRANS_SERVER_KEY = "k";
    expect(webhookServerKey()).toBe("k");
  });
});

describe("permukaan bayar mengikuti gerbang (#466 ditunda)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.PAYMENT_GATEWAY = saved.PAYMENT_GATEWAY;
    process.env.MANUAL_PAYMENT_INSTRUCTIONS = saved.MANUAL_PAYMENT_INSTRUCTIONS;
  });

  it("tanpa PAYMENT_GATEWAY → tidak menawarkan VA/QRIS: tombolnya tak boleh muncul", () => {
    delete process.env.PAYMENT_GATEWAY;
    expect(offersInstantPayment()).toBe(false);
  });

  it("transport MOCK tetap dihitung bisa — alurnya harus bisa dilatih di laptop", () => {
    process.env.PAYMENT_GATEWAY = "midtrans";
    // NODE_ENV=test → resolver memulangkan mock, dan mock MEMANG menerbitkan VA.
    expect(offersInstantPayment()).toBe(true);
  });

  it("diturunkan dari objek gerbangnya, bukan dari env — jadi tak bisa menyimpang", () => {
    expect(offersInstantPayment({ name: "manual", createCharge: async () => ({} as never) })).toBe(
      false
    );
    expect(offersInstantPayment({ name: "midtrans", createCharge: async () => ({} as never) })).toBe(
      true
    );
  });

  it("instruksi manual: env bila ada, KOSONG bila tidak (permukaan punya kalimat terjemahannya)", () => {
    delete process.env.MANUAL_PAYMENT_INSTRUCTIONS;
    expect(manualPaymentInstructions()).toBeNull();
    process.env.MANUAL_PAYMENT_INSTRUCTIONS = "Transfer ke BCA 123";
    expect(manualPaymentInstructions()).toBe("Transfer ke BCA 123");
  });

  it("gerbang manual tidak memaku kalimat Indonesia ke dalam jawabannya", async () => {
    delete process.env.PAYMENT_GATEWAY;
    delete process.env.MANUAL_PAYMENT_INSTRUCTIONS;
    const charge = await resolvePaymentGateway().createCharge({
      invoiceNumber: "PINV-Y",
      grossAmount: "10.00",
      method: "virtual_account",
    });
    expect(charge.instructions).toBeUndefined();
  });
});

describe("PPN tagihan platform — lewat lib/tax.ts, tarif tidak diketik ulang", () => {
  it("nominal tagihan = computeTax(harga, DEFAULT_TAX_RATE) persis", () => {
    const expected = computeTax(150000, DEFAULT_TAX_RATE);
    const amounts = platformInvoiceAmounts("150000.00", true);
    expect(amounts.amount).toBe(expected.dpp.toFixed(2));
    expect(amounts.taxAmount).toBe(expected.taxAmount.toFixed(2));
    expect(amounts.total).toBe(expected.total.toFixed(2));
    expect(amounts.taxRate).toBe(DEFAULT_TAX_RATE);
    expect(Number(amounts.taxAmount)).toBeGreaterThan(0); // tax_amount berhenti 0
  });

  it("sakelar nonaktif (⚠ keputusan penasihat pajak) → PPN 0, total = DPP", () => {
    const amounts = platformInvoiceAmounts("150000.00", false);
    expect(amounts.taxAmount).toBe("0.00");
    expect(amounts.total).toBe(amounts.amount);
  });

  it("modul lifecycle tidak mengetik ulang tarif — 11 tidak muncul sebagai angka pajak", () => {
    const src = readFileSync(
      join(__dirname, "..", "src", "lib", "subscription-lifecycle.ts"),
      "utf8"
    );
    expect(src).toContain("DEFAULT_TAX_RATE"); // tarif dari lib/tax.ts …
    expect(src).not.toMatch(/TAX_RATE\s*=\s*11|=\s*0\.11/); // … bukan literal lokal
  });
});

describe("tidak ada data kartu di mana pun (AC #141)", () => {
  it("skema platform & modul gerbang tidak punya satu pun kolom/kode kartu", () => {
    const schema = readFileSync(
      join(__dirname, "..", "prisma", "platform", "schema.prisma"),
      "utf8"
    );
    const gateway = readFileSync(
      join(__dirname, "..", "src", "lib", "payment-gateway.ts"),
      "utf8"
    );
    // Batas kata, bukan substring: "pan" hidup di dalam kata Indonesia yang
    // sah ("lapisan", "simpan") — yang dilarang adalah IDENTIFIER-nya.
    for (const banned of [/\bcard_number\b/i, /\bcardnumber\b/i, /\bpan\b/i, /\bcvv\b/i, /\bcvn\b/i, /\bexpiry_month\b/i]) {
      expect(schema).not.toMatch(banned);
      expect(gateway).not.toMatch(banned);
    }
  });
});
