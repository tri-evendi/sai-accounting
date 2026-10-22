/** Batas hari laporan mengikuti jam Jakarta, apa pun zona waktu prosesnya. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { businessDayEnd, businessDayStart, businessISODate } from "@sai/core/business-date";
import { resolveAsOf, resolvePeriod } from "@/lib/report-catalog";
import { monthRange } from "@/lib/dashboard-summary";
import { nextOccurrence, occurrenceKey, planOccurrences } from "@/lib/recurring";
import { planInvoiceReminders, REMINDER_POINTS } from "@/lib/invoice-reminder";
import { buildEfaktur } from "@sai/core/efaktur";
import { statementBounds } from "@/lib/bank-statements";

describe("tanggal bisnis = jam Jakarta (WIB, UTC+7)", () => {
  it("awal dan akhir hari ber-offset +07:00", () => {
    expect(businessDayStart("2026-06-30").toISOString()).toBe("2026-06-29T17:00:00.000Z");
    expect(businessDayEnd("2026-06-30").toISOString()).toBe("2026-06-30T16:59:59.999Z");
  });

  it("tanggal hari ini berganti pukul 00.00 WIB, bukan 00.00 UTC", () => {
    expect(businessISODate(new Date("2026-06-30T16:59:59.999Z"))).toBe("2026-06-30");
    expect(businessISODate(new Date("2026-06-30T17:00:00.000Z"))).toBe("2026-07-01");
  });

  it("per tanggal dan periode laporan memakai batas Jakarta", () => {
    expect(resolveAsOf("2026-06-30").asOf.toISOString()).toBe("2026-06-30T16:59:59.999Z");
    expect(resolveAsOf(undefined, new Date("2026-06-30T18:00:00Z")).asOfISO).toBe("2026-07-01");
    const p = resolvePeriod("2026-01-01", "2026-06-30");
    expect(p.from.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-06-30T16:59:59.999Z");
  });

  it("bulan berjalan beranda mengikuti tanggal Jakarta", () => {
    const r = monthRange(new Date("2026-06-30T18:00:00Z")); // 1 Juli 01.00 WIB
    expect(r.fromISO).toBe("2026-07-01");
    expect(r.toISO).toBe("2026-07-31");
    expect(r.to.toISOString()).toBe("2026-07-31T16:59:59.999Z");
  });

  it("formulir penjualan, pembelian, dan stok tidak memakai tanggal UTC sebagai bawaan", () => {
    const D = join(__dirname, "..", "src", "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]");
    for (const f of ["sales/new/sales-wizard.tsx", "purchases/new/purchase-wizard.tsx", "inventory/update/stock-form.tsx"]) {
      const src = readFileSync(join(D, f), "utf8");
      expect(src, f).toContain("businessISODate(new Date())");
      expect(src, f).not.toMatch(/todayISO[^\n]*toISOString\(\)/);
    }
  });
});

/* Sapuan sisa `toISOString().slice(0, 10)` (22 Okt 2026). Instan acuannya
   30 Juni 17.30 UTC = 1 Juli 00.30 WIB: tanggal UTC-nya masih 30 Juni, tanggal
   bisnisnya sudah 1 Juli. Setiap uji di bawah lulus di zona proses mana pun —
   dijalankan dengan TZ=UTC, Asia/Shanghai, dan America/New_York. */
describe("sapuan tanggal bisnis: hari ini = hari Jakarta", () => {
  const DINI_HARI_1_JULI = new Date("2026-06-30T17:30:00.000Z");
  const tanggal = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("templat berulang tanggal 1 terbit pada 00.30 WIB tanggal 1, bukan sehari kemudian", () => {
    const rule = { frequency: "monthly" as const, startDate: tanggal("2026-06-01"), endDate: null, maxOccurrences: null };
    const terbit = planOccurrences({ rule, today: DINI_HARI_1_JULI });
    expect(terbit.map((o) => o.key)).toContain("2026-07-01");
    expect(nextOccurrence(rule, DINI_HARI_1_JULI)?.toISOString().slice(0, 10)).toBe("2026-08-01");
    // Kunci idempotensinya tetap tanggal kalender murni — bentuknya tidak bergeser.
    expect(occurrenceKey(tanggal("2026-07-01"))).toBe("2026-07-01");
  });

  it("pengingat H-3 jatuh tempo 4 Juli terpicu pada 00.30 WIB 1 Juli", () => {
    const planned = planInvoiceReminders({
      candidates: [{ invoiceId: 1, dueDate: tanggal("2026-07-04"), email: "a@contoh.test" }],
      today: DINI_HARI_1_JULI,
      points: REMINDER_POINTS,
    });
    expect(planned).toEqual([{ invoiceId: 1, point: "before_3", dueKey: "2026-07-04" }]);
  });

  it("e-Faktur: tanggal dokumen dan masa pajak mengikuti hari Jakarta", () => {
    const seller = { npwp: "01.234.567.8-901.000", name: "PT Contoh" };
    const base = {
      invoiceNo: "SI-1",
      currency: "IDR",
      rate: null,
      dpp: 1_000_000,
      taxAmount: 110_000,
      taxRate: 11,
      buyerName: "PT Pembeli",
      buyerNpwp: "09.876.543.2-109.000",
      buyerAddress: "Jakarta",
      pebNumber: null,
      pebDate: null,
      exportNote: null,
    };
    const [instan] = buildEfaktur(seller, [{ ...base, date: DINI_HARI_1_JULI }]).rows;
    expect(instan.tanggal_dokumen).toBe("2026-07-01");
    expect(instan.masa_pajak).toBe("07");
    // Tanggal kalender yang tersimpan sebagai tengah malam UTC tidak bergeser.
    const [kalender] = buildEfaktur(seller, [{ ...base, date: tanggal("2026-06-30") }]).rows;
    expect(kalender.tanggal_dokumen).toBe("2026-06-30");
    expect(kalender.masa_pajak).toBe("06");
  });

  it("periode rekening koran mencakup hari terakhirnya sampai 23.59 WIB", () => {
    const { start, end } = statementBounds({ periodStart: tanggal("2026-06-01"), periodEnd: tanggal("2026-06-30") });
    expect(start.toISOString()).toBe("2026-05-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-30T16:59:59.999Z");
  });
});
