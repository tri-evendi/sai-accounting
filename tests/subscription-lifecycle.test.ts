/**
 * Mesin siklus hidup langganan (issue #140) — diuji TUNTAS:
 *   • SELURUH matriks (status × event) disapu — diagram §7.4 harfiah, dan
 *     setiap sel di luar diagram adalah `null` (bukan-perpindahan);
 *   • `cancelled` keadaan akhir mutlak, dan TIDAK ADA perpindahan mana pun
 *     yang menghapus data (yang berubah selalu hanya STATUS);
 *   • suspended = HANYA-BACA: klasifikasi tulis/baca disapu untuk SEMUA izin
 *     di matriks perusahaan — ekspor tetap boleh;
 *   • perencana penjadwal idempoten: hasil putaran pertama membuat putaran
 *     kedua kosong — dijalankan dua kali tidak menagih dua kali.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALL_SUBSCRIPTION_STATUSES,
  GRACE_PERIOD_DAYS,
  SUBSCRIPTION_EVENTS,
  invoiceNumberFor,
  isReadOnlyTenantStatus,
  isWritePermission,
  nextPeriod,
  pendingReminder,
  planDunning,
  planGraceExpiries,
  planTrialExpiries,
  readOnlyRefusal,
  tenantStatusForSubscription,
  transition,
  type SubscriptionEvent,
} from "@/lib/subscription-lifecycle";
import type { SubscriptionStatus } from "@/lib/platform-constants";
import { PERMISSIONS } from "@/lib/authz";

describe("transition — matriks LENGKAP (status × event), diagram §7.4 harfiah", () => {
  /* Setiap sel dieja eksplisit: sel yang tidak disebut diagram = null. */
  const EXPECTED: Record<SubscriptionStatus, Record<SubscriptionEvent, SubscriptionStatus | null>> = {
    trialing: {
      payment_received: "active",
      payment_failed: null,
      trial_expired: "active", // siklus tagih dimulai — bukan hadiah gratis
      grace_expired: null,
      cancel: null,
    },
    active: {
      payment_received: "active", // perpanjangan — sah, keadaan tetap
      payment_failed: "past_due",
      trial_expired: null,
      grace_expired: null,
      cancel: null, // berhenti hanya dari suspended (diagram)
    },
    past_due: {
      payment_received: "active",
      payment_failed: null,
      trial_expired: null,
      grace_expired: "suspended",
      cancel: null,
    },
    suspended: {
      payment_received: "active", // bayar = pulih penuh
      payment_failed: null,
      trial_expired: null,
      grace_expired: null,
      cancel: "cancelled",
    },
    cancelled: {
      payment_received: null,
      payment_failed: null,
      trial_expired: null,
      grace_expired: null,
      cancel: null,
    },
  };

  it("menyapu SEMUA sel — tidak ada pasangan (status, event) yang tak teruji", () => {
    for (const status of ALL_SUBSCRIPTION_STATUSES) {
      for (const event of SUBSCRIPTION_EVENTS) {
        expect(
          transition(status, event),
          `transition(${status}, ${event})`
        ).toBe(EXPECTED[status][event]);
      }
    }
  });

  it("cancelled adalah keadaan akhir mutlak — nol jalan keluar", () => {
    for (const event of SUBSCRIPTION_EVENTS) {
      expect(transition("cancelled", event)).toBeNull();
    }
  });

  it("status tenant = salinan status langganan (identitas)", () => {
    for (const status of ALL_SUBSCRIPTION_STATUSES) {
      expect(tenantStatusForSubscription(status)).toBe(status);
    }
  });
});

describe("suspended = HANYA-BACA — klasifikasi disapu untuk SEMUA izin", () => {
  it("setiap izin di matriks perusahaan terklasifikasi dari akhirannya", () => {
    const READ_ACTIONS = new Set(["read", "view", "export"]);
    for (const permission of PERMISSIONS) {
      const action = permission.slice(permission.lastIndexOf(".") + 1);
      expect(
        isWritePermission(permission),
        `klasifikasi ${permission}`
      ).toBe(!READ_ACTIONS.has(action));
    }
  });

  it("ekspor TETAP boleh saat suspended — pelanggan menunggak justru paling butuh mengunduh bukunya", () => {
    expect(isWritePermission("report.export")).toBe(false);
    expect(readOnlyRefusal("suspended", "report.export")).toBeNull();
    expect(readOnlyRefusal("suspended", "report.read")).toBeNull();
  });

  it("izin tulis ditolak saat suspended DAN cancelled; baca selalu lolos", () => {
    for (const status of ["suspended", "cancelled"]) {
      expect(readOnlyRefusal(status, "invoice.write")).not.toBeNull();
      expect(readOnlyRefusal(status, "customer.delete")).not.toBeNull();
      expect(readOnlyRefusal(status, "user.manage")).not.toBeNull();
      expect(readOnlyRefusal(status, "invoice.read")).toBeNull();
    }
  });

  it("status berjalan (trialing/active/past_due) tidak pernah hanya-baca", () => {
    for (const status of ["trialing", "active", "past_due", "pending_verification"]) {
      expect(isReadOnlyTenantStatus(status)).toBe(false);
      expect(readOnlyRefusal(status, "invoice.write")).toBeNull();
    }
  });

  it("tanpa tenant (adopsi #134 belum tuntas) BUKAN hanya-baca — gerbangnya tentang suspensi", () => {
    expect(readOnlyRefusal(null, "invoice.write")).toBeNull();
    expect(readOnlyRefusal(undefined, "invoice.write")).toBeNull();
  });

  it("aksi TAK DIKENAL dihitung menulis — izin baru yang lupa didaftar tertutup, bukan terbuka", () => {
    expect(isWritePermission("foo.bar")).toBe(true);
    expect(isWritePermission("noDotAction")).toBe(true);
  });
});

describe("perencana penjadwal — IDEMPOTEN: putaran kedua kosong", () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const daysAhead = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  it("trial habis: terpilih sekali; setelah statusnya berpindah, putaran kedua kosong", () => {
    const subs = [
      { id: 1, status: "trialing", trialEndsAt: daysAgo(1), pastDueSince: null },
      { id: 2, status: "trialing", trialEndsAt: daysAhead(3), pastDueSince: null },
      { id: 3, status: "active", trialEndsAt: daysAgo(1), pastDueSince: null },
    ];
    expect(planTrialExpiries(subs, now)).toEqual([1]);

    // Terapkan hasilnya (status berpindah lewat mesin) → rencana berikutnya kosong.
    subs[0].status = transition("trialing", "trial_expired")!;
    expect(planTrialExpiries(subs, now)).toEqual([]);
  });

  it("tenggang habis: hanya past_due yang melewati GRACE_PERIOD_DAYS; putaran kedua kosong", () => {
    const subs = [
      { id: 1, status: "past_due", trialEndsAt: null, pastDueSince: daysAgo(GRACE_PERIOD_DAYS + 1) },
      { id: 2, status: "past_due", trialEndsAt: null, pastDueSince: daysAgo(GRACE_PERIOD_DAYS - 1) },
    ];
    expect(planGraceExpiries(subs, now)).toEqual([1]);

    subs[0].status = transition("past_due", "grace_expired")!;
    expect(planGraceExpiries(subs, now)).toEqual([]);
  });

  it("dunning: hanya tagihan terbit yang lewat tempo pada langganan aktif; setelah past_due, kosong", () => {
    const invoices = [
      { id: 10, subscriptionId: 1, status: "issued", dueDate: daysAgo(1) },
      { id: 11, subscriptionId: 2, status: "issued", dueDate: daysAhead(1) },
      { id: 12, subscriptionId: 3, status: "paid", dueDate: daysAgo(9) },
    ];
    const statusById = new Map([
      [1, "active"],
      [2, "active"],
      [3, "active"],
    ]);
    expect(planDunning(invoices, statusById, now)).toEqual([1]);

    statusById.set(1, transition("active", "payment_failed")!);
    expect(planDunning(invoices, statusById, now)).toEqual([]);
  });

  it("nomor tagihan DETERMINISTIK — dua putaran menghasilkan nomor yang sama (unik di DB = tak tertagih dua kali)", () => {
    const start = new Date("2026-08-01T00:00:00Z");
    expect(invoiceNumberFor(7, start)).toBe("PINV-S7-20260801");
    expect(invoiceNumberFor(7, start)).toBe(invoiceNumberFor(7, new Date(start)));
    expect(invoiceNumberFor(8, start)).not.toBe(invoiceNumberFor(7, start));
  });

  it("pengingat H-7/H-3/H-1: kirim yang paling mendesak, catat semua yang jatuh tempo; sesudah dicatat → null", () => {
    const target = daysAhead(2.5); // di antara H-3 dan H-1
    const first = pendingReminder(target, now, new Set());
    expect(first).not.toBeNull();
    expect(first!.sendKey.startsWith("H-3:")).toBe(true);
    expect(first!.markKeys.map((k) => k.split(":")[0])).toEqual(["H-7", "H-3"]);

    // Idempotensi: kunci yang sudah dicatat membuat putaran berikutnya diam.
    const sent = new Set(first!.markKeys);
    expect(pendingReminder(target, now, sent)).toBeNull();

    // Baru pada jendela H-1 pengingat berikutnya lahir — sekali lagi saja.
    const later = new Date(target.getTime() - 12 * 60 * 60 * 1000);
    const second = pendingReminder(target, later, sent);
    expect(second).not.toBeNull();
    expect(second!.sendKey.startsWith("H-1:")).toBe(true);

    // Lewat tanggalnya = bukan lagi urusan pengingat.
    expect(pendingReminder(target, daysAhead(4), new Set())).toBeNull();
    expect(pendingReminder(daysAgo(1), now, new Set())).toBeNull();
  });

  it("nextPeriod menggulung bulan & tahun dengan benar", () => {
    const from = new Date("2026-01-31T00:00:00Z");
    expect(nextPeriod("monthly", from).end.toISOString().slice(0, 10)).toBe("2026-03-03"); // gulung akhir bulan ala Date
    expect(nextPeriod("yearly", from).end.toISOString().slice(0, 10)).toBe("2027-01-31");
    expect(nextPeriod("monthly", from).start).toEqual(from);
  });
});

describe("tidak ada penghapusan data pada keadaan mana pun (AC #140)", () => {
  it("penjadwal tidak memanggil satu pun delete/drop", () => {
    // Sumbernya disapu langsung: satu-satunya jaminan yang tidak membusuk
    // bersama refactor adalah yang diperiksa dari kodenya sendiri.
    const src = readFileSync(
      join(__dirname, "..", "scripts", "subscription-scheduler.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\.delete\(|\.deleteMany\(|DROP DATABASE/i);
  });
});
