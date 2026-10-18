/**
 * Daftar perpanjangan H-60 — pengingat MANUSIA selama penagihan perpanjangan
 * belum ada di kode mana pun (KOMERSIALISASI §11).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@sai/core/control-db", () => ({ controlDb: {} }));
vi.mock("@/lib/platform-db", () => ({ platformDb: {} }));

import { upcomingRenewalsForOperator } from "@/lib/operator/store";

const NOW = new Date("2026-10-17T00:00:00Z");

function deps(fail = false) {
  const calls: unknown[] = [];
  return {
    calls,
    deps: {
      platform: {
        subscription: {
          findMany: async (args: unknown) => {
            calls.push(args);
            if (fail) throw new Error("platform mati");
            return [
              {
                id: 1,
                tenantId: 7,
                status: "past_due",
                billingCycle: "monthly",
                billingMode: "manual",
                price: { toString: () => "599000" },
                currency: "IDR",
                currentPeriodEnd: new Date("2026-10-10T00:00:00Z"),
                plan: { name: "Pro" },
              },
              {
                id: 2,
                tenantId: 99,
                status: "active",
                billingCycle: "yearly",
                billingMode: "auto",
                price: { toString: () => "5990000" },
                currency: "IDR",
                currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
                plan: { name: "Pro" },
              },
            ];
          },
        },
      },
      control: {
        tenant: { findMany: async () => [{ id: 7, name: "PT Contoh", slug: "pt-contoh" }] },
      },
    } as never,
  };
}

describe("perpanjangan mendatang", () => {
  it("hanya langganan BERBAYAR yang berakhir dalam jendela, terurut, termasuk yang sudah lewat", async () => {
    const { calls, deps: d } = deps();
    const rows = await upcomingRenewalsForOperator(60, NOW, d);
    expect(calls[0]).toMatchObject({
      where: {
        status: { in: ["active", "past_due"] },
        currentPeriodEnd: { lte: new Date("2026-12-16T00:00:00Z") },
      },
      orderBy: { currentPeriodEnd: "asc" },
    });
    expect(rows?.map((r) => [r.tenantName, r.daysLeft, r.price])).toEqual([
      ["PT Contoh", -7, "599000"],
      /* Tenant yang barisnya hilang di kendali tetap tampil — tanpa nama. */
      [null, 45, "5990000"],
    ]);
  });

  it("platform mati → null (halaman berkata 'belum bisa dibaca')", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await upcomingRenewalsForOperator(60, NOW, deps(true).deps)).toBeNull();
    err.mockRestore();
  });
});
