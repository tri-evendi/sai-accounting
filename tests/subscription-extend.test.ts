/**
 * Perpanjangan KOMPENSASI — periode berbayar tanpa gerbang pembayaran.
 *
 * Aksi UANG, jadi yang diuji di sini adalah aturannya, bukan tampilannya:
 * dari kapan periode dihitung, berapa jauh ia maju, dan apa yang membuat
 * perpanjangan yang sama tidak pernah dijalankan dua kali.
 */
import { describe, expect, it } from "vitest";

import {
  compedInvoiceNumber,
  extendPeriod,
  extensionStart,
} from "@/lib/operator/writes";
import { extendSubscriptionSchema } from "@/lib/validations/operator";

const NOW = new Date("2026-08-21T00:00:00.000Z");

describe("titik mulai perpanjangan", () => {
  it("memakai akhir periode berjalan bila masih di depan", () => {
    /* Tenant dengan sisa trial dua minggu tidak kehilangan dua minggu itu —
       "perpanjang" yang memotong sisa yang sudah dijanjikan bukan perpanjangan. */
    const akhir = new Date("2026-09-20T00:00:00.000Z");
    expect(extensionStart(akhir, NOW).toISOString()).toBe(akhir.toISOString());
  });

  it("memakai HARI INI bila periodenya sudah lewat", () => {
    /* Langganan yang kedaluwarsa tiga bulan lalu tidak diperpanjang mundur ke
       masa lalu — itu memberi periode yang sebagian sudah habis. */
    const akhir = new Date("2026-05-01T00:00:00.000Z");
    expect(extensionStart(akhir, NOW).toISOString()).toBe(NOW.toISOString());
  });
});

describe("panjang periode", () => {
  it("satu tahun", () => {
    expect(extendPeriod(NOW, "yearly", 1).toISOString().slice(0, 10)).toBe("2027-08-21");
  });

  it("dua tahun", () => {
    expect(extendPeriod(NOW, "yearly", 2).toISOString().slice(0, 10)).toBe("2028-08-21");
  });

  it("tiga bulan", () => {
    expect(extendPeriod(NOW, "monthly", 3).toISOString().slice(0, 10)).toBe("2026-11-21");
  });

  it("nol atau negatif tetap memberi satu periode — tidak pernah mundur", () => {
    expect(extendPeriod(NOW, "monthly", 0).getTime()).toBeGreaterThan(NOW.getTime());
    expect(extendPeriod(NOW, "monthly", -5).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("nomor tagihan kompensasi", () => {
  it("berakhiran -K, terbedakan dari nomor penjadwal", () => {
    /* Penjadwal memakai `PINV-S<id>-<tanggal>`; tanpa akhiran, perpanjangan
       untuk periode yang sama akan menabrak tagihan penagihan yang sah. */
    expect(compedInvoiceNumber(7, NOW)).toBe("PINV-S7-20260821-K");
  });

  it("deterministik — itulah kunci idempotensinya", () => {
    expect(compedInvoiceNumber(7, NOW)).toBe(compedInvoiceNumber(7, new Date(NOW)));
  });
});

describe("pagar payload", () => {
  const dasar = { tenantId: 5, cycle: "yearly" as const, reason: "kompensasi gangguan #416" };

  it("menerima satu tahun", () => {
    expect(extendSubscriptionSchema.safeParse({ ...dasar, periods: 1 }).success).toBe(true);
  });

  it("menolak nol dan negatif", () => {
    expect(extendSubscriptionSchema.safeParse({ ...dasar, periods: 0 }).success).toBe(false);
    expect(extendSubscriptionSchema.safeParse({ ...dasar, periods: -1 }).success).toBe(false);
  });

  it("menolak angka yang jelas salah ketik", () => {
    /* 240 bulan = dua puluh tahun gratis yang baru ketahuan saat seseorang
       membaca laporan, dan mencabutnya berarti menyentuh uang lagi. */
    expect(extendSubscriptionSchema.safeParse({ ...dasar, periods: 240 }).success).toBe(false);
  });

  it("menuntut alasan", () => {
    const tanpaAlasan = { tenantId: 5, cycle: "yearly" as const, periods: 1, reason: "" };
    expect(extendSubscriptionSchema.safeParse(tanpaAlasan).success).toBe(false);
  });

  it("hanya mengenal dua siklus", () => {
    expect(
      extendSubscriptionSchema.safeParse({ ...dasar, periods: 1, cycle: "weekly" }).success
    ).toBe(false);
  });
});
