/**
 * PERISTIWA LANGGANAN (migration platform 0003): setiap penulis
 * `subscriptions` mencatat peristiwanya — riwayat yang terlewat hari ini tidak
 * bisa diisi mundur.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { recordSubscriptionEvent, SUBSCRIPTION_EVENT_KINDS } from "@/lib/subscription-events";

const AKAR = process.cwd();

function berkasTs(dir: string): string[] {
  const keluar: string[] = [];
  for (const e of readdirSync(join(AKAR, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "generated" || e.name === "node_modules") continue;
      keluar.push(...berkasTs(p));
    } else if (/\.tsx?$/.test(e.name)) keluar.push(p);
  }
  return keluar;
}

const tanpaKomentar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("setiap penulis langganan mencatat peristiwanya", () => {
  const semua = [...berkasTs("src"), ...berkasTs("scripts")];
  const penulis = semua
    .map((f) => {
      const isi = tanpaKomentar(readFileSync(join(AKAR, f), "utf8"));
      return {
        f,
        tulis: (isi.match(/\bsubscription\.(update|create|updateMany|upsert|createMany)\(/g) ?? []).length,
        catat: (isi.match(/\brecordSubscriptionEvent\(/g) ?? []).length,
      };
    })
    .filter((x) => x.tulis > 0);

  it("penulisnya ditemukan — penjaga atas tes ini sendiri", () => {
    expect(penulis.map((p) => p.f)).toEqual(
      expect.arrayContaining([
        "src/lib/payment-webhook.ts",
        "src/lib/billing/change-tenant-plan.ts",
        "src/lib/operator/writes.ts",
        "scripts/subscription-scheduler.ts",
      ])
    );
  });

  it("jumlah pencatatan ≥ jumlah tulisan di setiap berkas", () => {
    const kurang = penulis.filter((p) => p.catat < p.tulis).map((p) => `${p.f}: ${p.tulis} tulis, ${p.catat} catat`);
    expect(
      kurang,
      "Tulisan baru ke `subscriptions` WAJIB diikuti recordSubscriptionEvent — lihat lib/subscription-events.ts."
    ).toEqual([]);
  });

  it("kosakata kode = CHECK constraint di migration", () => {
    const sql = readFileSync(
      join(AKAR, "prisma/postgresql/platform/0003_subscription_events/migration.sql"),
      "utf8"
    );
    const m = sql.match(/"kind" IN \(([^)]+)\)/);
    const diSql = [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(diSql).toEqual([...SUBSCRIPTION_EVENT_KINDS].sort());
  });
});

describe("recordSubscriptionEvent", () => {
  it("harga tidak pernah melewati Number; rincian sebagai teks JSON", async () => {
    const create = vi.fn(async () => ({}));
    const now = new Date("2026-10-17T00:00:00Z");
    await recordSubscriptionEvent(
      { subscriptionEvent: { create } } as never,
      {
        subscriptionId: 1,
        tenantId: 7,
        kind: "plan",
        actor: "operator:vyn",
        fromPrice: { toString: () => "249000.00" },
        toPrice: "599000.00",
        details: { reason: "naik paket" },
      },
      now
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "plan",
        fromPrice: "249000.00",
        toPrice: "599000.00",
        details: '{"reason":"naik paket"}',
        occurredAt: now,
      }),
    });
  });

  it("gagal-lunak: tulisan langganan yang sudah terjadi tidak ikut gagal", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordSubscriptionEvent(
        { subscriptionEvent: { create: async () => Promise.reject(new Error("penuh")) } } as never,
        { subscriptionId: 1, tenantId: 7, kind: "status", actor: "scheduler" }
      )
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledOnce();
    err.mockRestore();
  });
});
