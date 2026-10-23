/**
 * KESEHATAN OUTBOX (09 §4) — putusan murni, alarm, dan permukaannya.
 *
 * Dua sinyal, dan masing-masing menutup kebohongan yang lain: umur baris
 * tertua (peristiwa yang tertahan) dan kesegaran jejak (relay yang mati tidak
 * menulis apa pun, jadi umur terakhirnya terbaca sehat selamanya).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";
import {
  OUTBOX_LAG_LATE_SECONDS,
  OUTBOX_LAG_WARN_SECONDS,
  OUTBOX_RELAY_STALE_SECONDS,
  outboxHealth,
  type OutboxRelayBookRow,
} from "@sai/core/outbox-health";
import { decideOutboxAlert } from "@/lib/health-watchdog";
import { readOutboxRelay } from "@sai/platform/outbox-relay-store";

const SEKARANG = new Date("2026-10-23T10:00:00Z");
const detikLalu = (s: number) => new Date(SEKARANG.getTime() - s * 1000);

function buku(over: Partial<OutboxRelayBookRow> = {}): OutboxRelayBookRow {
  return {
    companyId: 1,
    lastPassAt: detikLalu(5),
    oldestUnpublishedAt: null,
    unpublishedCount: 0,
    lastError: null,
    ...over,
  };
}

describe("outboxHealth", () => {
  it("tanpa jejak = `unknown`, bukan `ok`", () => {
    expect(outboxHealth([], SEKARANG).status).toBe("unknown");
  });

  it("jejak segar tanpa baris tertahan = `ok`", () => {
    const h = outboxHealth([buku(), buku({ companyId: 2 })], SEKARANG);
    expect(h.status).toBe("ok");
    expect(h.oldestAgeSeconds).toBeNull();
  });

  it("umur tertua lintas buku menentukan `lagging` dan `late`", () => {
    expect(
      outboxHealth([buku({ oldestUnpublishedAt: detikLalu(OUTBOX_LAG_WARN_SECONDS - 1), unpublishedCount: 1 })], SEKARANG)
        .status
    ).toBe("ok");
    expect(
      outboxHealth(
        [buku(), buku({ companyId: 2, oldestUnpublishedAt: detikLalu(OUTBOX_LAG_WARN_SECONDS), unpublishedCount: 3 })],
        SEKARANG
      )
    ).toMatchObject({ status: "lagging", oldestAgeSeconds: OUTBOX_LAG_WARN_SECONDS, unpublishedTotal: 3 });
    expect(
      outboxHealth([buku({ oldestUnpublishedAt: detikLalu(OUTBOX_LAG_LATE_SECONDS) })], SEKARANG).status
    ).toBe("late");
  });

  it("jejak BASI = `late` walau umurnya nol — relay mati tidak menulis apa pun", () => {
    const h = outboxHealth(
      [buku(), buku({ companyId: 9, lastPassAt: detikLalu(OUTBOX_RELAY_STALE_SECONDS) })],
      SEKARANG
    );
    expect(h.status).toBe("late");
    expect(h.staleBooks).toEqual([9]);
  });

  it("galat buku disebut, tapi umurnya yang memutuskan", () => {
    const h = outboxHealth([buku({ lastError: "kendali menolak" })], SEKARANG);
    expect(h.status).toBe("ok");
    expect(h.erroredBooks).toEqual([1]);
  });
});

describe("decideOutboxAlert", () => {
  const dasar = { oldestAgeSeconds: null, unpublishedTotal: 0, staleSlugs: [], erroredSlugs: [] };

  it("diam untuk ok, lagging, dan unknown", () => {
    for (const status of ["ok", "lagging", "unknown"] as const) {
      expect(decideOutboxAlert({ ...dasar, status }).alert).toBe(false);
    }
  });

  it("berbunyi untuk late — sidik jarinya membedakan relay mati dari peristiwa tertahan", () => {
    const mati = decideOutboxAlert({ ...dasar, status: "late", staleSlugs: ["pt-a"] });
    expect(mati.alert).toBe(true);
    expect(mati.fingerprint).toBe("outbox:stale");
    expect(mati.body).toContain("pt-a");
    const tertahan = decideOutboxAlert({ ...dasar, status: "late", oldestAgeSeconds: 900, erroredSlugs: ["pt-b"] });
    expect(tertahan.fingerprint).toBe("outbox:lag");
    expect(tertahan.body).toContain("pt-b");
  });
});

describe("readOutboxRelay", () => {
  it("membuang jejak buku yang sudah tidak ada di registry", async () => {
    const klien = {
      outboxRelayBook: {
        findMany: async () => [
          { ...buku({ companyId: 1 }), publishedLastPass: 0 },
          /* Buku yang dihapus: jejaknya basi selamanya, dan itu bukan relay mati. */
          { ...buku({ companyId: 99, lastPassAt: detikLalu(86_400) }), publishedLastPass: 0 },
        ],
      },
      company: { findMany: async () => [{ id: 1, slug: "pt-a" }] },
    };
    const snap = await readOutboxRelay(klien as never, SEKARANG);
    expect(snap.books.map((b) => b.slug)).toEqual(["pt-a"]);
    expect(snap.health.status).toBe("ok");
  });
});

describe("permukaan", () => {
  const baca = (p: string) => readFileSync(join(AKAR_REPO, p), "utf8");

  it("/api/health memuat `outbox` — satu kata, dari jejak kendali, tidak menyapu buku", () => {
    const laporan = baca("src/lib/health-report.ts");
    expect(laporan).toMatch(/outbox: outboxStatus,/);
    expect(laporan).toMatch(/readOutboxRelay\(controlDb\)\)\.health\.status/);
  });

  it("watch:health punya komponen `outbox`", () => {
    const w = baca("scripts/watch-health.ts");
    expect(w).toMatch(/nama: "outbox"/);
    expect(w).toMatch(/decideOutboxAlert\(/);
  });

  it("konsol /scheduler membaca jejak relay", () => {
    expect(baca("apps/operator/src/app/(operator)/scheduler/page.tsx")).toMatch(/outboxRelayForOperator\(\)/);
  });
});
